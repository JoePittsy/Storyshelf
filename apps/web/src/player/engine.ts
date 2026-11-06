// The audio engine: one module-level <audio> element and a small store, outside React.
// Everything is driven by media events and real elapsed time, never timers, which background tabs and iOS throttle.
import { useSyncExternalStore } from 'react';
import { chapterIndexAt, nextChapterTarget, previousChapterTarget, type Chapter } from './chapters';
import { AbsError } from '../api/auth';
import { diag } from './diag';
import { installHandlers, updateMetadata, updatePlaybackState, updatePositionState } from './mediaSession';
import { supportedMimeTypes } from './mime';
import { isRepeatFailure, srcNotSupportedError } from './failure';
import type { Progress as LibraryProgress } from '../api/libraries';
import { chooseStart, refreshedPosition, restoredPatch, restoredSeek, type Restorable } from './restore';
import { createRetryOnce, decide, stalledFor, STALL_MS, type Intent } from './resume';
import {
  UnsupportedFormatError,
  closeSession,
  openSession,
  saveProgress,
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
  /**
   * The book was put back on load: shown paused where it was left, but with no playback session and no audio loaded.
   * The first Play opens the session (`play()` runs, inside the click) and clears this.
   */
  restored: boolean;
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
  restored: false,
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
let ownChange = false; // from our own src change until its `loadstart`: the pause that implies isn't the listener's
let awaitingPlaying: number | null = null; // performance.now() of a play() that hasn't produced `playing` yet
const retry = createRetryOnce();
let recovering = false;
let token = 0; // bumped by every play()/stop() so a slow session open can tell it was superseded
let lastRequest: { itemId: string; from?: number } | null = null;
// A restored book has no session, so nothing here syncs it. These hold what Play needs to start from the right place.
let movedHere: number | null = null; // book seconds: a deliberate seek, skip or chapter jump made since the restore
let restoredAt = 0; // ms: when the server last heard of the place the snapshot shows
let moveTimer: ReturnType<typeof setTimeout> | undefined;
let syncChain: Promise<void> = Promise.resolve();
let mimes: string[] | null = null;

const getMimes = (a: HTMLAudioElement) => (mimes ??= supportedMimeTypes(a));
const coverFor = (id: string) => `/api/items/${id}/cover?width=512&format=jpeg`;

/** The element's real state, for the diagnostics log. */
function snap(extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    paused: audio?.paused ?? null,
    rs: audio?.readyState ?? null,
    ns: audio?.networkState ?? null,
    ct: audio ? Math.round(audio.currentTime * 10) / 10 : null,
    st: state.status,
    vis: typeof document === 'undefined' ? null : document.visibilityState,
    ...extra,
  };
}
const note = (ev: string, extra?: Record<string, unknown>) => diag.log(ev, snap(extra));
const errInfo = (e: unknown) =>
  e instanceof Error ? { name: e.name, message: e.message } : { name: 'unknown', message: String(e) };

/** Lock-screen button follows the element, not our status. */
function syncPlaybackState(): void {
  if (audio && session) updatePlaybackState(audio.paused ? 'paused' : 'playing');
}

/** Metadata changes can make iOS forget the handlers, so install them again with every update. */
function setMetadata(item: PlayerItem | null, chapterTitle: string): void {
  updateMetadata(item, chapterTitle);
  installHandlers(mediaActions);
}

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
  if (chapterChanged) setMetadata(state.item, state.chapters[idx]?.title ?? '');
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
      const before = session.id;
      const active = await syncSession(session, p, mimes ?? []);
      if (session && session.libraryItemId === active.libraryItemId) session = active;
      diag.log('sync ok', { status: 200, reopened: active.id !== before, at: Math.round(p.currentTime) });
    } catch (e) {
      diag.log('sync failed', { status: e instanceof AbsError ? e.status : null, ...errInfo(e) });
      // Not lost: add it back so the next sync carries it.
      clock = { listened: clock.listened + p.timeListened, lastSynced: clock.lastSynced };
    }
  });
  return syncChain;
}

function syncIfDue(): Promise<void> {
  return session && dueOnStop(clock, position()) ? doSync() : Promise.resolve();
}

const savedListeners = new Set<() => void>();
/**
 * Calls back when the server has been given the latest progress for a stop: after a pause has synced, and after a
 * session has closed. Not on the periodic syncs while playing. Returns the unsubscribe.
 */
export function onProgressSaved(cb: () => void): () => void {
  savedListeners.add(cb);
  return () => void savedListeners.delete(cb);
}
const emitSaved = () => savedListeners.forEach((cb) => cb());

let lastFailAt: number | null = null;

function fail(e: unknown): void {
  awaitingPlaying = null;
  const now = performance.now();
  // The error event and the play() rejection report one failure twice; say it once.
  if (isRepeatFailure(lastFailAt, now)) return void diag.log('fail (repeat)', errInfo(e));
  lastFailAt = now;
  diag.log('fail', errInfo(e));
  const message =
    e instanceof UnsupportedFormatError ? MSG_FORMAT : e instanceof TypeError ? MSG_NETWORK : MSG_OTHER;
  set({ status: 'error', error: message });
  updatePlaybackState('paused');
}

/** play() on the element, logged. A rejection that isn't an abort or a missing gesture gets one reload-and-retry. */
function startPlay(a: HTMLAudioElement, why = 'play'): void {
  awaitingPlaying = performance.now();
  note(`play() called (${why})`);
  a.play().then(
    () => note('play() resolved'),
    (e: unknown) => {
      note('play() rejected', errInfo(e));
      if (e instanceof DOMException && e.name === 'AbortError') return; // superseded by another src or pause
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        // The browser wants a tap. Keep the lock screen truthful.
        awaitingPlaying = null;
        set({ status: 'paused' });
        updatePlaybackState('paused');
        return;
      }
      if (!reloadAndPlay('rejected')) fail(e);
    },
  );
}

/** Reload the current track at the current position and play, once per resume. False when it can't or already did. */
function reloadAndPlay(why: string): boolean {
  if (!session || !track || !audio) return false;
  if (!retry.attempt()) return false;
  const here = audio.currentTime > 0 ? toBookTime(track, audio.currentTime) : state.position;
  const { track: tr, offset } = locate(session.audioTracks, here);
  note(`reload and retry (${why})`, { to: Math.round(here) });
  load(tr, offset, true);
  return true;
}

/** Called from events and wake-ups: if play() was asked for 3 s ago and nothing has played, reload. */
function checkStall(why: string): void {
  if (awaitingPlaying !== null && stalledFor(awaitingPlaying, performance.now(), STALL_MS)) {
    note(`stalled (${why})`);
    awaitingPlaying = null;
    reloadAndPlay('stalled');
  }
}

/** Resume or pause the element, deciding on what it is doing rather than on what we last heard. */
function act(intent: Intent, why: string): void {
  const a = getAudio();
  note(`action ${intent} (${why})`);
  const todo = decide(intent, a.paused);
  if (todo === 'pause') return a.pause();
  if (todo !== 'play') return;
  if (session && track) {
    // iOS may have dropped the stream while paused and locked: start over now, inside this handler.
    if ((a.error || a.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) && reloadAndPlay('no source')) return;
    startPlay(a, why);
  } else if (lastRequest) void play(lastRequest.itemId, lastRequest.from);
}

/** Point the element at a track. Called synchronously from a gesture or the `ended` handler when autoplay is true. */
function load(tr: AudioTrack, offset: number, autoplay: boolean): void {
  if (!session) return;
  const a = getAudio();
  track = tr;
  ownChange = true;
  pendingOffset = offset;
  a.src = trackUrl(session, tr.index);
  a.defaultPlaybackRate = a.playbackRate = state.rate; // loading a new src resets the rate to the default
  if (autoplay) startPlay(a, 'load');
}

function seekBook(t: number): void {
  if (!session && state.restored) {
    // Nothing is loaded: move the place Play will start from.
    const r = restoredSeek(t, state.duration, state.chapters);
    movedHere = r.position;
    set(r);
    // Nothing is syncing this book, so tell the server now: another device then sees the move, and it isn't a place only this tab knows.
    clearTimeout(moveTimer);
    moveTimer = setTimeout(flushMoved, MOVE_SAVE_MS);
    return;
  }
  if (!session || !audio) return;
  const target = clampSeek(t, totalDuration(session.audioTracks));
  const { track: tr, offset } = locate(session.audioTracks, target);
  if (tr.index === track?.index) audio.currentTime = offset;
  else load(tr, offset, state.status === 'playing');
  set({ position: target, chapterIndex: chapterIndexAt(state.chapters, target) });
  if (state.status !== 'playing') void syncIfDue();
  mediaPosition();
}

const MOVE_SAVE_MS = 500;

/** Send a move made on a session-less restored book as progress (PATCH /api/me/progress/:id). Best effort: Play still honours it. */
function flushMoved(): void {
  clearTimeout(moveTimer);
  moveTimer = undefined;
  if (movedHere === null || !state.restored || !state.item) return;
  const id = state.item.id;
  saveProgress(id, movedHere, state.duration).then(
    () => emitSaved(),
    (e: unknown) => diag.log('move not saved', errInfo(e)),
  );
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

  for (const ev of ['play', 'waiting', 'stalled', 'suspend', 'emptied', 'loadstart', 'canplay', 'abort'])
    a.addEventListener(ev, () => note(`audio ${ev}`));
  installHandlers(mediaActions);

  a.addEventListener('loadstart', () => {
    ownChange = false; // any pause caused by our src change has fired by now
  });
  a.addEventListener('loadedmetadata', () => {
    if (pendingOffset > 0) a.currentTime = pendingOffset;
    pendingOffset = 0;
  });
  a.addEventListener('play', () => {
    if (session) updatePlaybackState('playing');
  });
  a.addEventListener('playing', () => {
    note('audio playing');
    if (!session) return;
    ownChange = false;
    recovering = false;
    awaitingPlaying = null;
    retry.reset();
    lastMs = performance.now();
    set({ status: 'playing' });
    updatePlaybackState('playing');
    mediaPosition();
  });
  a.addEventListener('waiting', () => {
    if (session) accountPlayingTime();
    lastMs = null;
    checkStall('waiting');
  });
  a.addEventListener('stalled', () => checkStall('stalled'));
  a.addEventListener('suspend', () => checkStall('suspend'));
  a.addEventListener('pause', () => {
    note(ownChange ? 'audio pause (ours, ignored)' : 'audio pause');
    if (!session || a.ended) return;
    if (ownChange) return; // our own src change: not the listener pausing
    awaitingPlaying = null;
    accountPlayingTime();
    set({ status: 'paused' });
    updatePlaybackState('paused');
    refresh();
    void syncIfDue().then(emitSaved);
    mediaPosition();
  });
  a.addEventListener('timeupdate', onTimeUpdate);
  a.addEventListener('seeked', mediaPosition);
  a.addEventListener('ended', () => {
    note('audio ended');
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
    note('audio error', { code: a.error?.code ?? null, message: a.error?.message ?? null });
    if (!session || !track) return;
    if (recovering || a.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      return fail(
        a.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? srcNotSupportedError(track.mimeType, (t) => a.canPlayType(t))
          : new TypeError(),
      );
    }
    // First failure after a resume: reload the same track right here. A second one falls through to the session re-open below.
    if (awaitingPlaying !== null && reloadAndPlay('error')) return;
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
  // iOS can drop Media Session handlers across a suspend, so put them back whenever the page wakes.
  const wake = (ev: string) => {
    note(ev);
    installHandlers(mediaActions);
    syncPlaybackState();
    checkStall(ev);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      note('visibilitychange hidden');
      void syncIfDue();
      flushMoved();
      diag.flush();
    } else wake('visibilitychange visible');
  });
  addEventListener('pagehide', () => {
    note('pagehide');
    void syncIfDue();
    flushMoved();
    diag.flush();
  });
  addEventListener('pageshow', (e) => wake(`pageshow${e.persisted ? ' (from cache)' : ''}`));
  document.addEventListener('freeze', () => {
    note('freeze');
    diag.flush();
  });
  document.addEventListener('resume', () => wake('resume'));
  diag.log('boot');
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
  lastRequest = { itemId, from };
  if (session?.libraryItemId === itemId && track) {
    if (from !== undefined) seekBook(from);
    if (a.paused) startPlay(a, 'play()');
    return;
  }
  // Everything up to the first await runs inside the click.
  // A restored book starts from the server's place unless the listener moved it here since (see `chooseStart`).
  const local = state.restored && state.item?.id === itemId ? movedHere : null;
  clearTimeout(moveTimer);
  moveTimer = undefined;
  movedHere = null;
  const old = detach();
  unlock(a);
  const mine = ++token;
  set({ status: 'loading', error: null, restored: false });
  if (old) {
    await closeSession(old.s, old.p);
    emitSaved();
  }
  let s: PlaybackSession;
  try {
    s = await openSession(itemId, getMimes(a));
  } catch (e) {
    if (mine === token) fail(e);
    return;
  }
  if (mine !== token) return void closeSession(s);
  session = s;
  const startAt = chooseStart(from, local, s.currentTime);
  clock = startClock(startAt);
  const item: PlayerItem = { id: itemId, title: s.displayTitle, author: s.displayAuthor, coverUrl: coverFor(itemId) };
  const start = clampSeek(startAt, totalDuration(s.audioTracks));
  const { track: tr, offset } = locate(s.audioTracks, start);
  set({
    item,
    chapters: s.chapters,
    duration: s.duration,
    position: start,
    chapterIndex: chapterIndexAt(s.chapters, start),
    sleep: null,
  });
  setMetadata(item, s.chapters[chapterIndexAt(s.chapters, start)]?.title ?? '');
  load(tr, offset, true);
}

/**
 * Puts a book into the player paused where the listener left it, so the mini player is there on load. It opens no
 * session and loads no audio: the first Play does, through `play()`. Does nothing once anything is in the player.
 */
export function restore(r: Restorable, chapters: Chapter[]): void {
  if (state.status !== 'idle' || state.item) return;
  const patch = restoredPatch(r, coverFor(r.id), chapters);
  lastRequest = { itemId: r.id }; // no `from`: Play starts from the server's place, or from a move made here
  movedHere = null;
  restoredAt = r.updatedAt;
  set(patch);
  setMetadata(patch.item, chapters[patch.chapterIndex]?.title ?? '');
}

/**
 * The server's progress has been fetched again (the tab woke, or got focus): if it has a later place for the restored
 * book than the snapshot, show that, so the mini player never reads as truth with another device's place behind it.
 * A place moved here is left alone.
 */
export function refreshRestored(progress: Map<string, LibraryProgress>): void {
  if (!state.restored || !state.item) return;
  const p = progress.get(state.item.id);
  const server = p && { id: state.item.id, position: p.currentTime ?? 0, lastUpdate: p.lastUpdate ?? 0, isFinished: p.isFinished };
  const pos = refreshedPosition({ id: state.item.id, updatedAt: restoredAt, movedHere: movedHere !== null }, server);
  if (pos === null || !server) return;
  restoredAt = server.lastUpdate;
  const r = restoredSeek(pos, state.duration, state.chapters);
  set(r);
  setMetadata(state.item, state.chapters[r.chapterIndex]?.title ?? '');
}

export function toggle(): void {
  act('toggle', 'ui');
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
  movedHere = null;
  clearTimeout(moveTimer);
  set({ ...initial(), rate: state.rate, skipBack: state.skipBack, skipForward: state.skipForward });
  updateMetadata(null, '');
  updatePlaybackState('none');
  if (old) {
    await closeSession(old.s, old.p);
    emitSaved();
  }
}

const mediaActions = {
  play: () => act('play', 'lock screen'),
  pause: () => act('pause', 'lock screen'),
  skipBack: () => {
    note('action seekbackward');
    skip(-1);
  },
  skipForward: () => {
    note('action seekforward');
    skip(1);
  },
  previous: () => {
    note('action previoustrack');
    previousChapter();
  },
  next: () => {
    note('action nexttrack');
    nextChapter();
  },
  seekTo: (t: number) => {
    note('action seekto', { to: Math.round(t) });
    seek(t);
  },
};

const actions = { play, toggle, seek, skip, previousChapter, nextChapter, setRate, setSkip, setSleep, stop };

export function usePlayer(): PlayerState & typeof actions {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, ...actions };
}
