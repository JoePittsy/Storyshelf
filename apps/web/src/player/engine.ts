// The audio engine: one module-level <audio> element and a small store, outside React.
// Everything is driven by media events and real elapsed time, never timers, which background tabs and iOS throttle.
import { useSyncExternalStore } from 'react';
import { chapterIndexAt, nextChapterTarget, previousChapterTarget, type Chapter } from './chapters';
import { installHandlers, updateMetadata, updatePlaybackState, updatePositionState } from './mediaSession';
import { supportedMimeTypes } from './mime';
import {
  UnsupportedFormatError,
  closeSession,
  openSession,
  syncSession,
  trackUrl,
  type PlaybackSession,
  type Progress,
} from './session';
import { clampRate, loadSettings, saveSettings } from './settings';
import { sleepAtChapterEnd, sleepInMinutes, tickSleep, type SleepTimer } from './sleep';
import { dueOnStop, dueWhilePlaying, markSynced, payload, startClock, tick } from './sync';
import { clampSeek, locate, toBookTime, totalDuration, type AudioTrack } from './timeline';

export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type SleepChoice = 'off' | 'chapter' | { minutes: number };

export interface PlayerItem {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
}

export interface PlayerState {
  status: Status;
  item: PlayerItem | null;
  /** Book seconds. */
  position: number;
  duration: number;
  chapters: Chapter[];
  /** -1 when there are no chapters or the position is in a gap. */
  chapterIndex: number;
  rate: number;
  skipBack: number;
  skipForward: number;
  sleep: SleepTimer | null;
  /** Book seconds at the moment the sleep timer was set or changed: where the sleep progress window starts. */
  sleepFrom: number;
  error: string | null;
}

const MSG_FORMAT = "This book's audio format can't play in this browser yet.";
const MSG_NETWORK = "Couldn't reach the server. Check your connection and try again.";
const MSG_OTHER = "Couldn't start this book. Try again in a moment.";

const initial = (): PlayerState => ({
  status: 'idle',
  item: null,
  position: 0,
  duration: 0,
  chapters: [],
  chapterIndex: -1,
  ...loadSettings(),
  sleep: null,
  sleepFrom: 0,
  error: null,
});

let state = initial();
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((cb) => cb());
}

let audio: HTMLAudioElement | null = null;
let session: PlaybackSession | null = null;
let track: AudioTrack | null = null;
let clock = startClock(0);
let lastMs: number | null = null; // performance.now() at the last accounted playing moment
let pendingOffset = 0;
let switching = false; // between setting a new src and it being ready: ignore the pause that implies
let recovering = false;
let token = 0; // bumped by every play()/stop() so a slow session open can tell it was superseded
let lastRequest: { itemId: string; from?: number } | null = null;
let syncChain: Promise<void> = Promise.resolve();
let mimes: string[] | null = null;

const getMimes = (a: HTMLAudioElement) => (mimes ??= supportedMimeTypes(a));
const coverFor = (id: string) => `/api/items/${id}/cover?width=512&format=jpeg`;

/** Book seconds, from the element. */
const position = (): number => (session && track && audio ? toBookTime(track, audio.currentTime) : state.position);

function silentWav(): string {
  const n = 800; // 0.1 s of 8-bit mono silence at 8 kHz
  const b = new Uint8Array(44 + n).fill(0x80);
  const v = new DataView(b.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
}

/** iOS only lets play() start inside the user's gesture, and an await ends the gesture. Calling it here, synchronously, unlocks the element for the real source later. */
function unlock(a: HTMLAudioElement): void {
  a.src = silentWav();
  a.play().catch(() => undefined);
}

function refresh(): void {
  const pos = position();
  const idx = chapterIndexAt(state.chapters, pos);
  const chapterChanged = idx !== state.chapterIndex;
  set({ position: pos, chapterIndex: idx });
  if (chapterChanged) updateMetadata(state.item, state.chapters[idx]?.title ?? '');
}

function mediaPosition(): void {
  if (session) updatePositionState(position(), session.duration, state.rate);
}

/** Send progress now. Serialised, so a slow sync can't be overtaken; a failed one keeps its listened time for the next. */
function doSync(): Promise<void> {
  const cur = session;
  if (!cur || !audio) return Promise.resolve();
  const p: Progress = payload(clock, position(), cur.duration);
  clock = markSynced(p.currentTime);
  syncChain = syncChain.then(async () => {
    if (!session || session.libraryItemId !== cur.libraryItemId) return;
    try {
      const active = await syncSession(session, p, mimes ?? []);
      if (session && session.libraryItemId === active.libraryItemId) session = active;
    } catch {
      // Not lost: add it back so the next sync carries it.
      clock = { listened: clock.listened + p.timeListened, lastSynced: clock.lastSynced };
    }
  });
  return syncChain;
}

function syncIfDue(): void {
  if (session && dueOnStop(clock, position())) void doSync();
}

function fail(e: unknown): void {
  const message =
    e instanceof UnsupportedFormatError ? MSG_FORMAT : e instanceof TypeError ? MSG_NETWORK : MSG_OTHER;
  set({ status: 'error', error: message });
  updatePlaybackState('paused');
}

function startPlay(a: HTMLAudioElement): void {
  a.play().catch((e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return; // superseded by another src or pause
    if (e instanceof DOMException && e.name === 'NotAllowedError') return void set({ status: 'paused' }); // the browser wants a tap
    fail(e);
  });
}

/** Point the element at a track. Called synchronously from a gesture or the `ended` handler when autoplay is true. */
function load(tr: AudioTrack, offset: number, autoplay: boolean): void {
  if (!session) return;
  const a = getAudio();
  track = tr;
  switching = true;
  pendingOffset = offset;
  a.src = trackUrl(session, tr.index);
  a.defaultPlaybackRate = a.playbackRate = state.rate; // loading a new src resets the rate to the default
  if (autoplay) startPlay(a);
}

function seekBook(t: number): void {
  if (!session || !audio) return;
  const target = clampSeek(t, totalDuration(session.audioTracks));
  const { track: tr, offset } = locate(session.audioTracks, target);
  if (tr.index === track?.index) audio.currentTime = offset;
  else load(tr, offset, state.status === 'playing');
  set({ position: target, chapterIndex: chapterIndexAt(state.chapters, target) });
  if (state.status !== 'playing') syncIfDue();
  mediaPosition();
}

function accountPlayingTime(): number {
  const now = performance.now();
  const dt = lastMs === null ? 0 : Math.min(now - lastMs, 30_000); // a long gap means the page was suspended, not listened to
  lastMs = state.status === 'playing' ? now : null;
  clock = tick(clock, dt / 1000);
  return dt;
}

function onTimeUpdate(): void {
  if (!session || state.status !== 'playing') return;
  const dt = accountPlayingTime();
  if (state.sleep) {
    const r = tickSleep(state.sleep, dt, position());
    set({ sleep: r.expired ? null : r.timer });
    if (r.expired) getAudio().pause(); // the pause handler syncs
  }
  refresh();
  if (dueWhilePlaying(clock)) void doSync();
}

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  audio = a;
  a.setAttribute('playsinline', '');
  a.preload = 'auto';

  a.addEventListener('loadedmetadata', () => {
    if (pendingOffset > 0) a.currentTime = pendingOffset;
    pendingOffset = 0;
  });
  a.addEventListener('canplay', () => {
    switching = false;
  });
  a.addEventListener('playing', () => {
    if (!session) return;
    switching = false;
    recovering = false;
    lastMs = performance.now();
    set({ status: 'playing' });
    updatePlaybackState('playing');
    mediaPosition();
  });
  a.addEventListener('waiting', () => {
    if (session) accountPlayingTime();
    lastMs = null;
  });
  a.addEventListener('pause', () => {
    if (!session || switching || a.ended) return;
    accountPlayingTime();
    set({ status: 'paused' });
    updatePlaybackState('paused');
    refresh();
    syncIfDue();
    mediaPosition();
  });
  a.addEventListener('timeupdate', onTimeUpdate);
  a.addEventListener('seeked', mediaPosition);
  a.addEventListener('ended', () => {
    if (!session || !track) return;
    accountPlayingTime();
    const tracks = session.audioTracks;
    const next = tracks[tracks.findIndex((t) => t.index === track?.index) + 1];
    // iOS needs src and play() inside this handler, on the same element, to carry on through a lock or background.
    if (next) return load(next, 0, true);
    set({ status: 'paused', position: totalDuration(tracks) });
    updatePlaybackState('paused');
    void doSync();
  });
  a.addEventListener('error', () => {
    if (!session || !track) return;
    if (recovering || a.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      return fail(a.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? new UnsupportedFormatError() : new TypeError());
    }
    // Often the server lost the session (restart). Syncing re-opens it, then carry on from where we were.
    recovering = true;
    const wasPlaying = state.status === 'playing';
    const t = position();
    void doSync().then(() => {
      if (!session) return;
      const { track: tr, offset } = locate(session.audioTracks, t);
      load(tr, offset, wasPlaying);
    });
  });
  return a;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncIfDue();
  });
  addEventListener('pagehide', syncIfDue);
}

/** Stop using the current session: remember where it was, then silence the element. */
function detach(): { s: PlaybackSession; p: Progress } | null {
  const s = session;
  if (!s) return null;
  const p = payload(clock, position(), s.duration);
  session = null;
  track = null;
  lastMs = null;
  getAudio().pause();
  return { s, p };
}

export async function play(itemId: string, from?: number): Promise<void> {
  const a = getAudio();
  installHandlers(mediaActions);
  lastRequest = { itemId, from };
  if (session?.libraryItemId === itemId && track) {
    if (from !== undefined) seekBook(from);
    startPlay(a);
    return;
  }
  // Everything up to the first await runs inside the click.
  const old = detach();
  unlock(a);
  const mine = ++token;
  set({ status: 'loading', error: null });
  if (old) await closeSession(old.s, old.p);
  let s: PlaybackSession;
  try {
    s = await openSession(itemId, getMimes(a));
  } catch (e) {
    if (mine === token) fail(e);
    return;
  }
  if (mine !== token) return void closeSession(s);
  session = s;
  clock = startClock(from ?? s.currentTime);
  const item: PlayerItem = { id: itemId, title: s.displayTitle, author: s.displayAuthor, coverUrl: coverFor(itemId) };
  const start = clampSeek(from ?? s.currentTime, totalDuration(s.audioTracks));
  const { track: tr, offset } = locate(s.audioTracks, start);
  set({
    item,
    chapters: s.chapters,
    duration: s.duration,
    position: start,
    chapterIndex: chapterIndexAt(s.chapters, start),
    sleep: null,
  });
  updateMetadata(item, s.chapters[chapterIndexAt(s.chapters, start)]?.title ?? '');
  load(tr, offset, true);
}

export function toggle(): void {
  const a = getAudio();
  if (state.status === 'playing') a.pause();
  else if (session && track) startPlay(a);
  else if (lastRequest) void play(lastRequest.itemId, lastRequest.from);
}

export const seek = (t: number): void => seekBook(t);
export const skip = (dir: -1 | 1): void => seekBook(position() + (dir < 0 ? -state.skipBack : state.skipForward));
export const previousChapter = (): void => seekBook(previousChapterTarget(state.chapters, position()));
export function nextChapter(): void {
  const t = nextChapterTarget(state.chapters, position());
  if (t !== null) seekBook(t);
}

export function setRate(rate: number): void {
  const r = clampRate(rate);
  const a = getAudio();
  a.defaultPlaybackRate = a.playbackRate = r;
  set({ rate: r });
  saveSettings({ rate: r, skipBack: state.skipBack, skipForward: state.skipForward });
  mediaPosition();
}

export function setSkip(back: number, forward: number): void {
  set({ skipBack: back, skipForward: forward });
  saveSettings({ rate: state.rate, skipBack: back, skipForward: forward });
}

export function setSleep(choice: SleepChoice): void {
  if (choice === 'off') return set({ sleep: null });
  set({
    sleep: choice === 'chapter' ? sleepAtChapterEnd(state.chapters, position()) : sleepInMinutes(choice.minutes),
    sleepFrom: position(),
  });
}

/** Stop, forget the book and close the server session (best effort). */
export async function stop(): Promise<void> {
  token++;
  const old = detach();
  if (audio) {
    audio.removeAttribute('src');
    audio.load();
  }
  lastRequest = null;
  set({ ...initial(), rate: state.rate, skipBack: state.skipBack, skipForward: state.skipForward });
  updateMetadata(null, '');
  updatePlaybackState('none');
  if (old) await closeSession(old.s, old.p);
}

const mediaActions = {
  play: () => {
    if (state.status !== 'playing') toggle();
  },
  pause: () => getAudio().pause(),
  skipBack: () => skip(-1),
  skipForward: () => skip(1),
  previous: previousChapter,
  next: nextChapter,
  seekTo: seek,
};

const actions = { play, toggle, seek, skip, previousChapter, nextChapter, setRate, setSkip, setSleep, stop };

export function usePlayer(): PlayerState & typeof actions {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, ...actions };
}
