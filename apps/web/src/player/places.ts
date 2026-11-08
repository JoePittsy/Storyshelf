// Where this device last left each book. Written as a book plays (with each sync, on pause, when the page hides) and
// when a restored book is moved, streamed or downloaded alike. Offline, it is one of the places a book can start from
// (see `localStart`). Per user and server, in localStorage.
import { rememberedUser, serverKey } from '../api/lastUser';

export interface Place {
  /** Book seconds. */
  position: number;
  /** ms since the epoch: when the place last changed here. */
  updatedAt: number;
}

export const PLACES_KEY = 'storyshelf.places';
/** Books kept; the oldest go first. */
const MAX = 200;

type Stored = Record<string, Place>;

const keyFor = (itemId: string): string => `${serverKey()}|${rememberedUser()?.id ?? ''}|${itemId}`;

function load(): Stored {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PLACES_KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Stored) : {};
  } catch {
    return {};
  }
}

function save(all: Stored): void {
  const keys = Object.keys(all);
  if (keys.length > MAX)
    keys
      .sort((a, b) => all[a].updatedAt - all[b].updatedAt)
      .slice(0, keys.length - MAX)
      .forEach((k) => delete all[k]);
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the server's place still stands.
  }
}

/** The place this device last left the book at, if any. */
export function placeOf(itemId: string): Place | undefined {
  const p = load()[keyFor(itemId)];
  return p && typeof p.position === 'number' && typeof p.updatedAt === 'number' ? p : undefined;
}

/**
 * Keeps the book's place. Within a second of the place already kept, nothing changes: its time stays when the place
 * last moved, so a place left alone (paused here while another device played on) never looks newer than it is.
 */
export function savePlace(itemId: string, position: number, now = Date.now()): void {
  if (!(position >= 0)) return;
  const all = load();
  const k = keyFor(itemId);
  const was = all[k];
  if (was && Math.abs(was.position - position) < 1) return;
  all[k] = { position, updatedAt: now };
  save(all);
}

/** The server's last known place for a book, as the cached progress has it. */
export interface KnownPlace {
  currentTime?: number;
  /** ms since the epoch. */
  lastUpdate?: number;
}

/**
 * Where a book starts when it plays from the device with no server session. A start point named outright (a chapter,
 * a bookmark), or a move made on the restored book, wins. Otherwise the newer of this device's own place and the
 * server's last known one; with neither, the beginning. `at` is when the chosen place was left (null when it was
 * named), for the rewind on resume.
 */
export function localStart(
  named: number | undefined,
  movedHere: number | null,
  saved: Place | undefined,
  server: KnownPlace | undefined
): { position: number; at: number | null } {
  if (named !== undefined) return { position: named, at: null };
  if (movedHere !== null) return { position: movedHere, at: null };
  const fromServer =
    server && typeof server.currentTime === 'number'
      ? { position: server.currentTime, updatedAt: server.lastUpdate ?? 0 }
      : undefined;
  const best =
    saved && fromServer ? (fromServer.updatedAt > saved.updatedAt ? fromServer : saved) : (saved ?? fromServer);
  return best ? { position: best.position, at: best.updatedAt || null } : { position: 0, at: null };
}
