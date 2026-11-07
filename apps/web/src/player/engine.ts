// The audio engine: one module-level <audio> element and a small store, outside React.
// Everything is driven by media events and real elapsed time, never timers, which background tabs and iOS throttle.
import { useSyncExternalStore } from 'react';
import { chapterIndexAt, nextChapterTarget, previousChapterTarget, type Chapter } from './chapters';
import { AbsError } from '../api/auth';
import { absUrl } from '../api/server';
import { attachAirPlay } from './airplay';
import { diag } from './diag';
import { newerElsewhere, SAME_PLACE_S, whoWrote, type ServerPlace, type Writer } from './handoff';
import { recentSessions, serverPlace } from './handoffServer';
import { BIG_SEEK_SECONDS, recordJump } from './jumpLog';
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
  ourDeviceId,
  saveProgress,
  syncSession,
  trackUrl,
  type PlaybackSession,
  type Progress,
} from './session';
import { clampRate, loadSettings, saveSettings } from './settings';
import { bookSpeed, forgetBookSpeeds, putBackBookSpeeds, rememberBookSpeed } from './bookSpeeds';
import { fellAsleepPlace, forgetFellAsleep, rememberFellAsleep } from './fellAsleep';
import { rewindSeconds, rewindTarget } from './rewind';
import { fadeLevel, sleepAtChapterEnd, sleepInMinutes, sleepRemainingMs, tickSleep, type SleepTimer } from './sleep';
import { dueOnStop, dueWhilePlaying, markSynced, payload, startClock, tick } from './sync';
import { clampSeek, locate, toBookTime, totalDuration, type AudioTrack } from './timeline';

export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type SleepChoice = 'off' | 'chapter' | { minutes: number };

/** A newer place for the loaded book, written by another device while this player sat paused (see handoff.ts). */
export interface Handoff {
  itemId: string;
  /** Book seconds: the server's place. */
  position: number;
  /** ms since the epoch: when the server got it. */
  lastUpdate: number;
  device: Writer;
}

/** What the player tells the screen about a hand-off it acted on without being asked (see `onHandoffNotice`). */
export type HandoffNotice =
  /** Play was pressed with a newer place elsewhere: the player took it. `from` is the place it left, for an Undo. */
  | { kind: 'adopted'; itemId: string; from: number; to: number; device: Writer }
  /** Another device moved the book while this one was playing. This one carried on; `at` is the other's place. */
  | { kind: 'conflict'; itemId: string; at: number; device: Writer };

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
  /** The speed playing now: the book's own (see bookSpeeds), or the default. */
  rate: number;
  /** The default speed, from Settings: for books that have no speed of their own. */
  defaultRate: number;
  skipBack: number;
  skipForward: number;
  /** Go back a little when playback resumes after a pause (see rewind). */
  rewindOnResume: boolean;
  sleep: SleepTimer | null;
  /** Book seconds at the moment the sleep timer was set or changed: where the sleep progress window starts. */
  sleepFrom: number;
  error: string | null;
  /**
   * The book was put back on load: shown paused where it was left, but with no playback session and no audio loaded.
   * The first Play opens the session (`play()` runs, inside the click) and clears this.
   */
  restored: boolean;
  /** The book played to the end of its last file and stopped there. Cleared when it plays again, is moved, or another book starts. */
  ended: boolean;
  /** A newer place another device wrote while this book sat paused: offered, never jumped to. Play takes it; a move dismisses it. */
  handoff: Handoff | null;
}

const MSG_FORMAT = "This book's audio format can't play in this browser yet.";
const MSG_NETWORK = "Couldn't reach the server. Check your connection and try again.";
const MSG_OTHER = "Couldn't start this book. Try again in a moment.";

/** The settings part of the state, as stored. */
function settingsState(): Pick<PlayerState, 'rate' | 'defaultRate' | 'skipBack' | 'skipForward' | 'rewindOnResume'> {
  const s = loadSettings();
  return { ...s, defaultRate: s.rate };
}

const initial = (): PlayerState => ({
  status: 'idle',
  item: null,
  position: 0,
  duration: 0,
  chapters: [],
  chapterIndex: -1,
  ...settingsState(),
  sleep: null,
  sleepFrom: 0,
  error: null,
  restored: false,
  ended: false,
  handoff: null,
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
// Date.now() when the listener (or the sleep timer) paused the book. A move or a play clears it. See `rewindOnResume`.
let pausedAt: number | null = null;
// The listener's own volume while the sleep timer fades it out; null when not fading.
let fadeFrom: number | null = null;
// Book seconds a file just pointed at will seek to once its metadata is in. Until then the element's clock reads 0 (a
// new src resets it), so `position()` gives this instead: a sync or a close in that moment sends the real place.
let pendingAt: number | null = null;

// Device hand-off (see handoff.ts). What the server last took from this player, and when it was sent, so a check can
// tell another device's write from this player's own.
let lastSent = 0;
let lastWriteAt = 0;
// Whether the place held here may be sent without asking the server first. A pause makes it false: from then until the
// listener chooses a place (Play, a move, taking the offer), another device may have moved on, and sending this place
// would lose theirs. Every write of the place goes through `doSync` or `detach`, which honour it.
let verified = true;
let checking: Promise<CheckResult> | null = null;
// Bumped by every move the listener makes, and by every book opened: a check that began before one is out of date.
let placeEpoch = 0;
// Date.now() when the last "another device was also playing" notice went out.
let conflictAt = -Infinity;

const getMimes = (a: HTMLAudioElement) => (mimes ??= supportedMimeTypes(a));
const coverFor = (id: string) => absUrl(`/api/items/${id}/cover?width=512&format=jpeg`);

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
const position = (): number =>
  session && track && audio ? (pendingAt ?? toBookTime(track, audio.currentTime)) : state.position;

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

/**
 * Send progress now, unless the place may be stale: after a pause nothing is sent until the server has been asked
 * whether another device has moved on (`verify`). If one has, a paused book offers that place and sends nothing; a
 * book that has just been played takes it, and sends that.
 */
function doSync(): Promise<void> {
  if (!session || !audio) return Promise.resolve();
  if (verified) return send();
  // One sync waits for the answer; any that come due meanwhile are that one (it sends the place as it is then).
  held ??= verify()
    .then((r) => (verified || r === 'clear' || r === 'failed' ? send() : undefined))
    .finally(() => {
      held = null;
    });
  return held;
}
let held: Promise<void> | null = null;

/** Send progress now. Serialised, so a slow sync can't be overtaken; a failed one keeps its listened time for the next. */
function send(): Promise<void> {
  const cur = session;
  if (!cur || !audio) return Promise.resolve();
  const p: Progress = payload(clock, position(), cur.duration);
  clock = markSynced(p.currentTime);
  syncChain = syncChain.then(async () => {
    if (!session || session.libraryItemId !== cur.libraryItemId) return;
    try {
      const before = session.id;
      const sentAt = Date.now();
      const active = await syncSession(session, p, mimes ?? []);
      if (session && session.libraryItemId === active.libraryItemId) {
        session = active;
        lastSent = p.currentTime;
        lastWriteAt = sentAt;
      }
      // Stopped while the server was re-opening a lost session: that new session is nobody's, so close it.
      else if (active.id !== before) void closeSession(active);
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

const endedListeners = new Set<(itemId: string) => void>();
/**
 * Calls back with the book's id when it has played to the end of its last file, once that final place has been sent
 * (ABS marks a book finished when its place reaches the end). Returns the unsubscribe.
 */
export function onBookEnded(cb: (itemId: string) => void): () => void {
  endedListeners.add(cb);
  return () => void endedListeners.delete(cb);
}

let lastFailAt: number | null = null;

function fail(e: unknown): void {
  awaitingPlaying = null;
  const now = performance.now();
  // The error event and the play() rejection report one failure twice; say it once.
  if (isRepeatFailure(lastFailAt, now)) return void diag.log('fail (repeat)', errInfo(e));
  lastFailAt = now;
  diag.log('fail', errInfo(e));
  const message = e instanceof UnsupportedFormatError ? MSG_FORMAT : e instanceof TypeError ? MSG_NETWORK : MSG_OTHER;
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
    }
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
    takeNewerOnPlay();
    // iOS may have dropped the stream while paused and locked: start over now, inside this handler.
    if (rewindOnResume()) return;
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
  pendingAt = tr.startOffset + offset;
  a.src = trackUrl(session, tr.index);
  a.defaultPlaybackRate = a.playbackRate = state.rate; // loading a new src resets the rate to the default
  if (autoplay) startPlay(a, 'load');
}

function seekBook(t: number): void {
  // A move made while paused chooses where to start: no rewind on top of it. And the "fell asleep" offer has had its moment.
  pausedAt = null;
  forgetFellAsleep();
  // The listener has chosen a place: it may be sent, and a newer place on offer has had its moment too.
  placeEpoch++;
  verified = true;
  dismissHandoff(t);
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
  else load(tr, offset, state.status === 'playing' || !audio.paused); // !paused: Play is pressed, not yet playing
  set({ position: target, chapterIndex: chapterIndexAt(state.chapters, target), ended: false });
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
    (e: unknown) => diag.log('move not saved', errInfo(e))
  );
}

function accountPlayingTime(): number {
  const now = performance.now();
  const dt = lastMs === null ? 0 : Math.min(now - lastMs, 30_000); // a long gap means the page was suspended, not listened to
  lastMs = state.status === 'playing' ? now : null;
  clock = tick(clock, dt / 1000);
  return dt;
}

/**
 * Rewinds a little when the book has been paused a while (see rewind.ts), before it plays again, so the first sync
 * after resuming already carries the new place. It isn't a jump: nothing goes in the history or the undo log. Once per
 * pause. True when the rewind crossed into another file and has already started that playing.
 */
function rewindOnResume(): boolean {
  const since = pausedAt;
  pausedAt = null;
  if (since === null || !state.rewindOnResume || !session || !track || !audio) return false;
  const from = position();
  const to = rewindTarget(from, rewindSeconds(Date.now() - since), state.chapters);
  if (to === from) return false;
  note('rewind on resume', { from: Math.round(from), to: Math.round(to) });
  set({ position: to, chapterIndex: chapterIndexAt(state.chapters, to) });
  const { track: tr, offset } = locate(session.audioTracks, to);
  if (tr.index !== track.index) {
    load(tr, offset, true);
    return true;
  }
  audio.currentTime = offset;
  mediaPosition();
  return false;
}

/**
 * Sets the volume to `level` (0..1) of the listener's own, for the sleep timer's fade; 1 puts it back.
 *
 * This is `audio.volume`, not Web Audio: routing the element through an AudioContext can stop playback in the
 * background on iOS. iOS Safari treats `volume` as read-only (the hardware buttons own it): there the setter does
 * nothing and reads still give 1, so the fade is silently skipped and the timer pauses at full volume, as before.
 */
function fadeTo(level: number): void {
  if (!audio) return;
  if (level >= 1) return restoreVolume();
  fadeFrom ??= audio.volume;
  audio.volume = Math.min(1, Math.max(0, fadeFrom * level));
}

/** Ends a sleep fade: the volume goes back to what the listener had. */
function restoreVolume(): void {
  if (fadeFrom === null || !audio) return;
  audio.volume = fadeFrom;
  fadeFrom = null;
}

/** The sleep timer is pausing the book at `stoppedAt`: offer back the place the listener was last surely awake. */
function rememberWhereAsleep(stoppedAt: number): void {
  const place = state.item && fellAsleepPlace(state.sleepFrom, state.chapters, stoppedAt);
  if (state.item && place) rememberFellAsleep({ itemId: state.item.id, ...place, stoppedAt });
}

function onTimeUpdate(): void {
  if (!session || state.status !== 'playing') return;
  const dt = accountPlayingTime();
  if (state.sleep) {
    const pos = position();
    const r = tickSleep(state.sleep, dt, pos);
    set({ sleep: r.expired ? null : r.timer });
    if (r.expired) {
      rememberWhereAsleep(pos);
      getAudio().pause(); // the pause handler syncs, and puts the volume back
    } else fadeTo(fadeLevel(sleepRemainingMs(r.timer, pos, state.rate)));
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
  attachAirPlay(a);

  for (const ev of ['play', 'waiting', 'stalled', 'suspend', 'emptied', 'loadstart', 'canplay', 'abort'])
    a.addEventListener(ev, () => note(`audio ${ev}`));
  installHandlers(mediaActions);

  a.addEventListener('loadstart', () => {
    ownChange = false; // any pause caused by our src change has fired by now
  });
  a.addEventListener('loadedmetadata', () => {
    if (pendingOffset > 0) a.currentTime = pendingOffset;
    pendingOffset = 0;
    pendingAt = null;
  });
  a.addEventListener('play', () => {
    if (session) updatePlaybackState('playing');
  });
  a.addEventListener('playing', () => {
    note('audio playing');
    if (!session) return;
    pausedAt = null;
    pendingAt = null; // playing comes after the metadata: the element's clock is right by now
    forgetFellAsleep();
    ownChange = false;
    recovering = false;
    awaitingPlaying = null;
    retry.reset();
    lastMs = performance.now();
    set({ status: 'playing', ended: false });
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
    restoreVolume();
    pausedAt = Date.now();
    awaitingPlaying = null;
    accountPlayingTime();
    set({ status: 'paused' });
    updatePlaybackState('paused');
    refresh();
    void syncIfDue().then(emitSaved);
    // That sync carries the place just played. From here until the listener chooses a place, it isn't sent unchecked.
    verified = false;
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
    restoreVolume();
    set({ status: 'paused', position: totalDuration(tracks), ended: true });
    updatePlaybackState('paused');
    const id = session.libraryItemId;
    void doSync().then(() => {
      emitSaved();
      endedListeners.forEach((cb) => cb(id));
    });
  });
  a.addEventListener('error', () => {
    note('audio error', { code: a.error?.code ?? null, message: a.error?.message ?? null });
    if (!session || !track) return;
    if (recovering || a.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      return fail(
        a.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? srcNotSupportedError(track.mimeType, (t) => a.canPlayType(t))
          : new TypeError()
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
function detach(): { s: PlaybackSession; p: Progress | undefined } | null {
  const s = session;
  if (!s) return null;
  // Paused, and the place unchecked since: the close leaves the server's place alone (the pause sync already sent this
  // one), in case another device has moved on.
  const p = verified ? payload(clock, position(), s.duration) : undefined;
  session = null;
  track = null;
  pendingAt = null;
  lastMs = null;
  pausedAt = null;
  getAudio().pause();
  restoreVolume();
  return { s, p };
}

/** Makes the player's <audio> element now rather than at the first Play, so AirPlay can offer its targets before then. */
export function prepareAudio(): void {
  getAudio();
}

export async function play(itemId: string, from?: number): Promise<void> {
  const a = getAudio();
  lastRequest = { itemId, from };
  if (session?.libraryItemId === itemId && track) {
    if (from !== undefined) seekBook(from);
    if (a.paused) {
      takeNewerOnPlay();
      if (!rewindOnResume()) startPlay(a, 'play()');
    }
    return;
  }
  // Everything up to the first await runs inside the click.
  // A restored book starts from the server's place unless the listener moved it here since (see `chooseStart`).
  const local = state.restored && state.item?.id === itemId ? movedHere : null;
  // An unmoved restored book was last heard of at `restoredAt` (ABS `lastUpdate`): that is how long it has been paused,
  // if the server still has the same place. With no time to go on, it starts exactly where it was.
  const pausedSince =
    state.restored && state.item?.id === itemId && local === null && from === undefined && restoredAt > 0
      ? { position: state.position, at: restoredAt }
      : null;
  clearTimeout(moveTimer);
  moveTimer = undefined;
  movedHere = null;
  const old = detach();
  unlock(a);
  const mine = ++token;
  set({ status: 'loading', error: null, restored: false, ended: false, handoff: null });
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
  // The server holds the session's place, and whatever this starts from is chosen: nothing to check yet.
  lastSent = s.currentTime;
  lastWriteAt = Date.now();
  verified = true;
  placeEpoch++;
  conflictAt = -Infinity;
  let startAt = chooseStart(from, local, s.currentTime);
  if (pausedSince && state.rewindOnResume && Math.abs(s.currentTime - pausedSince.position) < 1)
    startAt = rewindTarget(startAt, rewindSeconds(Date.now() - pausedSince.at), s.chapters);
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
    rate: rateFor(itemId),
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
  set({ ...patch, rate: rateFor(r.id) });
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
  const server = p && {
    id: state.item.id,
    position: p.currentTime ?? 0,
    lastUpdate: p.lastUpdate ?? 0,
    isFinished: p.isFinished,
  };
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

export function seek(t: number): void {
  // A big move leaves the place it came from in the book's history. Shorter ones go through usePlayerJump, which logs its own.
  if (state.item && Math.abs(t - position()) > BIG_SEEK_SECONDS) recordJump(state.item.id, position());
  seekBook(t);
}
export const skip = (dir: -1 | 1): void => seekBook(position() + (dir < 0 ? -state.skipBack : state.skipForward));
export const previousChapter = (): void => seekBook(previousChapterTarget(state.chapters, position()));
export function nextChapter(): void {
  const t = nextChapterTarget(state.chapters, position());
  if (t !== null) seekBook(t);
}

/** The speed a book plays at: its own, or the default. */
const rateFor = (id: string): number => bookSpeed(id) ?? state.defaultRate;

function applyRate(r: number): void {
  const a = getAudio();
  a.defaultPlaybackRate = a.playbackRate = r;
  set({ rate: r });
  mediaPosition();
}

function persist(): void {
  saveSettings({
    rate: state.defaultRate,
    skipBack: state.skipBack,
    skipForward: state.skipForward,
    rewindOnResume: state.rewindOnResume,
  });
}

/** The player's speed control: the book in the player keeps this speed (with no book, it sets the default). */
export function setRate(rate: number): void {
  const r = clampRate(rate);
  applyRate(r);
  if (state.item) return rememberBookSpeed(state.item.id, r, state.defaultRate);
  set({ defaultRate: r });
  persist();
}

/** Settings' default speed, for books with no speed of their own. The book in the player follows it if it has none. */
export function setDefaultRate(rate: number): void {
  const r = clampRate(rate);
  set({ defaultRate: r });
  persist();
  if (!state.item || bookSpeed(state.item.id) === undefined) applyRate(r);
}

/** Every book back on the default speed. Returns an Undo. */
export function resetBookSpeeds(): () => void {
  const was = forgetBookSpeeds();
  if (state.item) applyRate(state.defaultRate);
  return () => {
    putBackBookSpeeds(was);
    if (state.item) applyRate(rateFor(state.item.id));
  };
}

export function setSkip(back: number, forward: number): void {
  set({ skipBack: back, skipForward: forward });
  persist();
}

export function setRewindOnResume(on: boolean): void {
  set({ rewindOnResume: on });
  persist();
}

export function setSleep(choice: SleepChoice): void {
  restoreVolume(); // changed or turned off mid-fade: the next tick fades again if it should
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
  const { defaultRate, skipBack, skipForward, rewindOnResume } = state;
  set({ ...initial(), rate: defaultRate, defaultRate, skipBack, skipForward, rewindOnResume });
  updateMetadata(null, '');
  updatePlaybackState('none');
  if (old) {
    // A sync already on its way finishes first, so the close (with the final place) is the last word the server hears.
    await syncChain;
    await closeSession(old.s, old.p);
    emitSaved();
  }
}

// ---- Device hand-off ----------------------------------------------------------------------------------------------

type CheckResult = 'clear' | 'offered' | 'adopted' | 'conflict' | 'failed' | 'stale';

/** A check that hasn't heard back by then has failed: it must never hold a playing book's syncs back for long. */
const CHECK_TIMEOUT_MS = 8000;
/** After saying another device was also playing, say it again only after this long. */
const CONFLICT_QUIET_MS = 15 * 60_000;

const noticeListeners = new Set<(n: HandoffNotice) => void>();
/** Calls back when the player took a newer place on Play, or carried on over another device's. Returns the unsubscribe. */
export function onHandoffNotice(cb: (n: HandoffNotice) => void): () => void {
  noticeListeners.add(cb);
  return () => void noticeListeners.delete(cb);
}
const notify = (n: HandoffNotice) => noticeListeners.forEach((cb) => cb(n));

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('timed out')), ms)));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** The element is playing, or about to: Play has been pressed and `playing` hasn't come yet. */
const playingHere = (): boolean => state.status === 'playing' || (!!audio && !audio.paused);

/** One check at a time: callers that come while one is out share its answer. */
function verify(): Promise<CheckResult> {
  checking ??= check().finally(() => {
    checking = null;
  });
  return checking;
}

/** Who wrote the server's newer place, from the book's latest sessions. Best effort: unknown on any failure. */
async function writerOf(itemId: string, place: ServerPlace): Promise<Writer> {
  try {
    return whoWrote(await within(recentSessions(itemId), CHECK_TIMEOUT_MS), place, ourDeviceId());
  } catch {
    return { name: null, sameBrowser: false };
  }
}

/**
 * Asks the server for the loaded book's place and acts on a newer one written elsewhere (see `newerElsewhere`):
 * - paused: it is offered (`handoff`), and nothing is sent;
 * - Play has been pressed since the pause (`verified` false): the player takes it, and says so for an Undo;
 * - playing on (`verified`): a conflict. This player carries on and wins at its next sync; a notice says another device
 *   was playing too, and their place goes in this visit's History.
 * Nothing newer while playing makes the place safe to send. A move made, or another book opened, while the question was
 * out makes the answer stale: it is dropped.
 */
async function check(): Promise<CheckResult> {
  const item = state.item;
  if (!session || !item || session.libraryItemId !== item.id) return 'stale';
  const epoch = placeEpoch;
  const still = () => placeEpoch === epoch && session?.libraryItemId === item.id;
  let server: ServerPlace | null;
  try {
    server = await within(serverPlace(item.id), CHECK_TIMEOUT_MS);
  } catch (e) {
    diag.log('handoff check failed', errInfo(e));
    if (!still()) return 'stale';
    // No way to tell. Play was pressed here, so this place goes on being sent, as it always did.
    if (playingHere()) verified = true;
    return 'failed';
  }
  if (!still()) return 'stale';
  if (!newerElsewhere(server, { position: position(), lastSent, lastWriteAt })) {
    if (state.handoff) set({ handoff: null });
    if (playingHere()) verified = true;
    return 'clear';
  }
  const place = server as ServerPlace;
  const device = await writerOf(item.id, place);
  if (!still()) return 'stale';
  const h: Handoff = { itemId: item.id, position: place.currentTime, lastUpdate: place.lastUpdate, device };
  diag.log('handoff', { at: Math.round(h.position), here: Math.round(position()), playing: playingHere(), verified });
  if (playingHere()) {
    if (verified) {
      conflict(h);
      return 'conflict';
    }
    adopt(h);
    return 'adopted';
  }
  if (state.status !== 'paused') return 'stale';
  const cur = state.handoff;
  if (!cur || cur.position !== h.position || cur.lastUpdate !== h.lastUpdate || cur.device.name !== h.device.name)
    set({ handoff: h });
  return 'offered';
}

/** Takes another device's newer place: Play was pressed with it newer. The place left goes in History, and Undo is offered. */
function adopt(h: Handoff): void {
  const from = position();
  recordJump(h.itemId, from);
  seekBook(h.position); // a chosen place now: the offer goes, and it is sent
  notify({ kind: 'adopted', itemId: h.itemId, from, to: h.position, device: h.device });
}

/** Another device moved the book while this one played: this one wins. Their place stays in History, a tap away. */
function conflict(h: Handoff): void {
  recordJump(h.itemId, h.position);
  if (Date.now() - conflictAt < CONFLICT_QUIET_MS) return;
  conflictAt = Date.now();
  notify({ kind: 'conflict', itemId: h.itemId, at: h.position, device: h.device });
}

/** A move to `t`: the newer place on offer goes. Unless `t` is that place, it stays in this visit's History. */
function dismissHandoff(t: number): void {
  const h = state.handoff;
  if (!h) return;
  if (Math.abs(t - h.position) > SAME_PLACE_S) recordJump(h.itemId, h.position);
  set({ handoff: null });
}

/**
 * Play after a pause: a newer place on offer is taken now, inside the gesture, so the old place never plays. With no
 * offer, and nothing chosen since the pause, the server is asked while it plays; its syncs wait for the answer.
 */
function takeNewerOnPlay(): void {
  const h = state.handoff;
  if (h && h.itemId === state.item?.id) adopt(h);
  else if (!verified) void verify();
}

/**
 * Asks the server whether another device has a newer place for the loaded book: when the page wakes or gets focus, and
 * now and then while it is open (see HandoffWatch). A book with no session (restored on load) is refreshed by
 * RestoreLastBook instead.
 */
export function checkHandoff(why: string): Promise<void> {
  if (!session || (state.status !== 'paused' && state.status !== 'playing')) return Promise.resolve();
  if (why !== 'tick') note(`handoff check (${why})`);
  return verify().then(() => undefined);
}

/** What the player held for a book `release` took out of it: enough to put it back, paused, with `restore`. */
export interface Released {
  restorable: Restorable;
  chapters: Chapter[];
}

/**
 * Takes a book out of the player before its progress is changed behind the player's back (marked finished or not, or
 * reset), so nothing the player sends afterwards (a sync, the close, a restored book's move) can undo the change. The
 * place it had reaches the server first: a playing book's last sync and close, or a restored book's unsaved move. Then
 * the player is empty. Resolves with what it held, or null when the book isn't in it (nothing is touched).
 */
export async function release(itemId: string): Promise<Released | null> {
  const opening = state.status === 'loading' && lastRequest?.itemId === itemId;
  if (state.item?.id !== itemId && !opening) return null;
  const held = state.item?.id === itemId ? state.item : null;
  const out: Released | null = held && {
    restorable: {
      id: itemId,
      title: held.title,
      author: held.author,
      duration: state.duration,
      position: position(),
      updatedAt: 0,
    },
    chapters: state.chapters,
  };
  const moved = state.restored ? movedHere : null;
  const duration = state.duration;
  await stop();
  if (moved !== null)
    await saveProgress(itemId, moved, duration).catch((e: unknown) => diag.log('move not saved', errInfo(e)));
  return out;
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

const actions = {
  play,
  toggle,
  seek,
  skip,
  previousChapter,
  nextChapter,
  setRate,
  setDefaultRate,
  resetBookSpeeds,
  setSkip,
  setRewindOnResume,
  setSleep,
  stop,
};

export function usePlayer(): PlayerState & typeof actions {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, ...actions };
}
