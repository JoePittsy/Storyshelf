/**
 * Listening done with no server session (a downloaded book played offline), kept on the device as ABS "local sessions"
 * and sent when the server can be reached: POST /api/session/local-all (checked against ABS 2.37.2,
 * PlaybackSessionManager.syncLocalSession).
 *
 * - Each session has an id made here and kept, so sending it again updates the same row: a retry is always safe.
 * - ABS files a session's listening under the date of its `updatedAt`, so a session never crosses local midnight: the
 *   first listening on a new day starts a new one where the last left off.
 * - ABS takes a session's place as the book's progress only when its own progress isn't newer than the session's
 *   `updatedAt` (`progressSynced` says which). The player listens (`onListeningSynced`) to offer a newer place instead
 *   of jumping to it.
 * - A session stays queued until the server has taken it, then goes. One still being listened to stays (marked as
 *   sent) so the next listening updates the same row.
 */
import { absFetch, hasAccessToken, onSessionRenewed } from '../api/auth';
import { isNetworkError, isOffline, subscribeConnectivity } from '../api/connectivity';
import { rememberedUser, serverKey } from '../api/lastUser';
import { diag } from './diag';
import { ourDeviceId } from './session';

/** A session as ABS takes it from a client. Times in seconds; `startedAt` and `updatedAt` in ms since the epoch. */
export interface LocalSession {
  id: string;
  libraryItemId: string;
  mediaType: 'book';
  /** ABS PlayMethod.LOCAL. */
  playMethod: 3;
  mediaPlayer: 'html5';
  displayTitle: string;
  displayAuthor: string;
  duration: number;
  startTime: number;
  currentTime: number;
  timeListening: number;
  startedAt: number;
  updatedAt: number;
}

interface Entry {
  session: LocalSession;
  /** Still being listened to: later listening on the same day updates it. */
  open: boolean;
  /** The `updatedAt` the server last took; 0 before it has taken any. */
  sentAt: number;
  /** Whose listening it is: sent only while that user is signed in on that server. */
  owner: string;
}

export interface SyncResult {
  id: string;
  libraryItemId: string;
  success: boolean;
  progressSynced: boolean;
  /** What was sent: the place, and its `updatedAt`. */
  currentTime: number;
  updatedAt: number;
  error?: string;
}

export const QUEUE_KEY = 'storyshelf.localSessions';

const ownerKey = (): string => `${serverKey()}|${rememberedUser()?.id ?? ''}`;

// localStorage is the record. Should it fail, the queue lives on in memory for as long as the page does.
let memory: Entry[] = [];
let storageFailed = false;

function read(): Entry[] {
  if (storageFailed) return memory;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((e: Entry | null) => !!e?.session?.id) : [];
  } catch {
    return memory;
  }
}

function save(list: Entry[]): void {
  memory = list;
  try {
    if (list.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    storageFailed = true;
  }
}

/** The local calendar day of a time, as a key. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** What the player has listened to since it last said: a sync's worth. */
export interface Listened {
  itemId: string;
  title: string;
  author: string;
  duration: number;
  /** Book seconds where this listening began, for a new session. */
  startTime: number;
  /** Book seconds now. */
  currentTime: number;
  /** Real seconds listened since the last call. */
  timeListened: number;
}

/** Adds listening to the book's open session, or starts one (a new day starts one too). */
export function recordListening(l: Listened, now = Date.now()): void {
  const owner = ownerKey();
  const list = read();
  let e = list.find((x) => x.open && x.owner === owner && x.session.libraryItemId === l.itemId);
  if (e && dayOf(e.session.updatedAt) !== dayOf(now)) {
    // Past midnight: that day's session is done (ABS files it under its `updatedAt`, so moving that on would move the
    // whole session to today), and this listening opens the next day's.
    e.open = false;
    const startTime = e.session.currentTime;
    e = undefined;
    l = { ...l, startTime };
  }
  if (!e) {
    // It began when this listening did, as far as today goes.
    const startedAt = Math.max(
      new Date(now).setHours(0, 0, 0, 0),
      now - Math.round(Math.max(0, l.timeListened) * 1000)
    );
    e = {
      session: {
        id: crypto.randomUUID(),
        libraryItemId: l.itemId,
        mediaType: 'book',
        playMethod: 3,
        mediaPlayer: 'html5',
        displayTitle: l.title,
        displayAuthor: l.author,
        duration: l.duration,
        startTime: l.startTime,
        currentTime: l.currentTime,
        timeListening: 0,
        startedAt,
        updatedAt: now,
      },
      open: true,
      sentAt: 0,
      owner,
    };
    list.push(e);
  }
  const s = e.session;
  s.currentTime = l.currentTime;
  s.timeListening += Math.max(0, l.timeListened);
  s.updatedAt = Math.max(now, s.startedAt);
  save(prune(list));
}

/** Done with the book's open session (stopped, or another book started): the next listening starts a new one. */
export function endListening(itemId: string): void {
  const owner = ownerKey();
  const list = read();
  list.forEach((e) => {
    if (e.owner === owner && e.session.libraryItemId === itemId) e.open = false;
  });
  save(prune(list));
}

/** A closed session the server has already taken as it stands has nothing left to send. */
const prune = (list: Entry[]): Entry[] => list.filter((e) => e.open || e.sentAt !== e.session.updatedAt);

/** Listening queued for the signed-in user that the server hasn't taken yet (for one book, given its id). */
export function hasUnsent(itemId?: string): boolean {
  const owner = ownerKey();
  return read().some(
    (e) =>
      e.owner === owner &&
      e.sentAt !== e.session.updatedAt &&
      (itemId === undefined || e.session.libraryItemId === itemId)
  );
}

/** For the tests. */
export function queuedSessions(): LocalSession[] {
  return read().map((e) => ({ ...e.session }));
}

const listeners = new Set<(results: SyncResult[]) => void>();
/** Calls back with what the server said each time it has been sent listening. Returns the unsubscribe. */
export function onListeningSynced(cb: (results: SyncResult[]) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

let flushing: Promise<SyncResult[]> | null = null;
let again = false;

/**
 * Sends every unsent session of the signed-in user. One send at a time; a call while one is out sends again after it,
 * so listening recorded meanwhile goes too. Resolves with what the server said (empty when nothing was sent).
 */
export function flushListening(): Promise<SyncResult[]> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = send().finally(() => {
    flushing = null;
    if (again) {
      again = false;
      void flushListening();
    }
  });
  return flushing;
}

let beforeSend: () => Promise<void> = () => Promise.resolve();
/** Something to do before any listening is sent (the player asks the server about the book it holds). */
export function setBeforeSend(fn: () => Promise<void>): void {
  beforeSend = fn;
}

async function send(): Promise<SyncResult[]> {
  if (isOffline() || !hasAccessToken()) return [];
  const owner = ownerKey();
  const isDue = (e: Entry) => e.owner === owner && e.sentAt !== e.session.updatedAt;
  if (!read().some(isDue)) return [];
  await beforeSend().catch(() => undefined);
  const due = read().filter(isDue);
  if (!due.length) return [];
  // As they are now: listening recorded while this is out changes the queue, not what was sent.
  const sent = due.map((e) => ({ ...e.session }));
  let reply: { results?: { id: string; success: boolean; progressSynced?: boolean; error?: string }[] };
  try {
    reply = await absFetch('/api/session/local-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceInfo: { deviceId: ourDeviceId(), clientName: 'Storyshelf' }, sessions: sent }),
    });
  } catch (e) {
    diag.log('local sessions not sent', {
      count: sent.length,
      network: isNetworkError(e),
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
  const results: SyncResult[] = sent.map((s) => {
    const r = reply?.results?.find((x) => x.id === s.id);
    return {
      id: s.id,
      libraryItemId: s.libraryItemId,
      success: !!r?.success,
      progressSynced: !!r?.progressSynced,
      currentTime: s.currentTime,
      updatedAt: s.updatedAt,
      ...(r?.error ? { error: r.error } : r ? {} : { error: 'no result' }),
    };
  });
  const list = read();
  for (const r of results) {
    const e = list.find((x) => x.session.id === r.id);
    if (!e) continue;
    // Taken, or refused for good (the book is gone from the server): either way it is done with. With no answer for
    // it, it stays for the next send.
    if (r.success || (r.error && r.error !== 'no result')) e.sentAt = r.updatedAt;
    if (!r.success && r.error !== 'no result') e.open = false;
  }
  save(prune(list));
  diag.log('local sessions sent', {
    results: results.map((r) => ({
      id: r.id.slice(0, 8),
      at: Math.round(r.currentTime),
      ok: r.success,
      progress: r.progressSynced,
      ...(r.error ? { error: r.error } : {}),
    })),
  });
  listeners.forEach((cb) => cb(results));
  return results;
}

/**
 * Sends queued listening whenever the server can be reached: now, when the app comes back online, and when the session
 * is renewed. Called once at launch (main.tsx). Returns the stop.
 */
export function startListeningSync(): () => void {
  // A session left open by an earlier visit is over: this page's listening starts new ones.
  const list = read();
  if (list.some((e) => e.open)) save(prune(list.map((e) => ({ ...e, open: false }))));
  let wasOffline = isOffline();
  const offConnectivity = subscribeConnectivity(() => {
    const off = isOffline();
    if (wasOffline && !off) void flushListening();
    wasOffline = off;
  });
  const offRenewed = onSessionRenewed(() => void flushListening());
  void flushListening();
  return () => {
    offConnectivity();
    offRenewed();
  };
}

export function resetListeningForTests(): void {
  memory = [];
  storageFailed = false;
  flushing = null;
  again = false;
  listeners.clear();
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Nothing kept.
  }
}
