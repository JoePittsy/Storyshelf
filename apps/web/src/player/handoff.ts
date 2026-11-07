// Device hand-off: telling a newer place written by another device (or another tab) from this player's own, naming
// that device, and the words for offering it. Pure; the engine does the fetching and the deciding when.
import type { ListeningSession, SessionDevice } from '../api/history';
import { fmtClock } from '../screens/bookHelpers';

/**
 * How far apart (book seconds) the server's place and this player's must be before it is worth an offer. Closer than
 * this is the same place give or take a rewind on resume (at most 30 s) or the last sync (10 s of listening): nothing a
 * listener would want to be asked about.
 */
export const HANDOFF_THRESHOLD_S = 30;

/** The server still holds the place this player last sent if it is within this. ABS stores what it was sent. */
export const SAME_PLACE_S = 3;

/** A session last updated within this of the newer place's update is the one that wrote it. */
export const WRITER_WINDOW_MS = 2 * 60_000;

/** The server's progress for the book, as far as a hand-off needs it. */
export interface ServerPlace {
  /** Book seconds. */
  currentTime: number;
  /** ms since the epoch: ABS stamps it with its own clock on every write. */
  lastUpdate: number;
  isFinished: boolean;
}

/** What this player knows of its own writes. */
export interface OurPlace {
  /** Book seconds: where the player is now. */
  position: number;
  /** Book seconds: the place the server last took from this player (or held when the session opened). */
  lastSent: number;
  /** ms since the epoch: when that write was sent. */
  lastWriteAt: number;
}

/**
 * True when the server has a newer place than this player's, written by someone else:
 *
 * - written after this player's last write (`lastUpdate` later than when it sent it);
 * - not the place this player sent (so it isn't our own write, whatever either clock says);
 * - and more than `HANDOFF_THRESHOLD_S` from where this player is now, ahead or behind.
 *
 * A finished book is left alone: finishing is a decision of its own, not a place to offer.
 */
export function newerElsewhere(server: ServerPlace | null, ours: OurPlace): boolean {
  if (!server || server.isFinished) return false;
  if (!(server.lastUpdate > ours.lastWriteAt)) return false;
  if (Math.abs(server.currentTime - ours.lastSent) <= SAME_PLACE_S) return false;
  return Math.abs(server.currentTime - ours.position) > HANDOFF_THRESHOLD_S;
}

/** Who wrote the newer place. `name` is a kind of device ("iPhone"); null when unknown. */
export interface Writer {
  name: string | null;
  /** It came from this browser (another tab or window): it shares this browser's device id. */
  sameBrowser: boolean;
}

/**
 * A short name for a device, from an ABS session's `deviceInfo`: the ABS apps send `model` (and `deviceName`), browsers
 * are known by the user agent ABS parsed (`osName`, `deviceType`). Never the device's own name, which may be a person's
 * ("Joe's iPhone" would read "Your Joe's iPhone"). Null when there is nothing to go on.
 */
export function deviceName(info: SessionDevice | null | undefined): string | null {
  if (!info) return null;
  const model = (info.model ?? '').trim();
  const os = (info.osName ?? '').toLowerCase();
  const all = `${model} ${info.deviceName ?? ''} ${os}`.toLowerCase();
  if (all.includes('ipad')) return 'iPad';
  if (all.includes('iphone') || os === 'ios') return 'iPhone';
  if (os.includes('mac')) return 'Mac';
  if (model && !/^(sdk|unknown|generic)/i.test(model)) return model;
  if (os.includes('android')) return info.deviceType === 'tablet' ? 'Android tablet' : 'Android phone';
  if (os.includes('windows')) return 'Windows PC';
  if (os.includes('chrome')) return 'Chromebook';
  if (os.includes('linux') || os.includes('ubuntu')) return 'Linux computer';
  return null;
}

/**
 * The writer of the server's place: a session that stopped at that same place, updated near when the place was. A
 * session somewhere else didn't write it, however recent (a write with no session behind it, such as another tab's
 * move before playing, would otherwise be put down to whichever device played last).
 */
export function whoWrote(
  sessions: ListeningSession[],
  place: { currentTime: number; lastUpdate: number },
  ourDeviceId: string
): Writer {
  let best: ListeningSession | null = null;
  for (const s of sessions) {
    const d = Math.abs(s.updatedAt - place.lastUpdate);
    const here = Math.abs(s.currentTime - place.currentTime) <= SAME_PLACE_S;
    if (here && d <= WRITER_WINDOW_MS && (!best || d < Math.abs(best.updatedAt - place.lastUpdate))) best = s;
  }
  const info = best?.deviceInfo ?? null;
  if (info?.deviceId && info.deviceId === ourDeviceId) return { name: null, sameBrowser: true };
  return { name: deviceName(info), sameBrowser: false };
}

/** A gap between two places: "42 min", "1 h 5 min", "12 h". Whole minutes, at least one. */
export function fmtGap(seconds: number): string {
  const mins = Math.max(1, Math.floor(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h >= 10 || m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Your iPhone", "Another tab", "Another device". */
export function writerSubject(w: Writer): string {
  return w.name ? `Your ${w.name}` : w.sameBrowser ? 'Another tab' : 'Another device';
}

/** "your iPhone's place": what a jump there is called in its Undo toast. */
export function writerPlace(w: Writer): string {
  return w.name ? `your ${w.name}'s place` : w.sameBrowser ? "the other tab's place" : "the other device's place";
}

/**
 * The offer's words. `label` is the sentence; `shortLabel` replaces it on a very narrow screen (the device glyph beside
 * it says whose place it is); `jumpLabel` names the place in the Undo toast.
 */
export function describeHandoff(
  h: { position: number; device: Writer },
  ours: number
): { label: string; shortLabel: string; jumpLabel: string; ahead: boolean } {
  const at = fmtClock(h.position, false);
  const ahead = h.position > ours;
  const who = writerSubject(h.device);
  return ahead
    ? {
        label: `${who} is ${fmtGap(h.position - ours)} ahead · Jump to ${at}`,
        shortLabel: `Jump ahead to ${at}`,
        jumpLabel: writerPlace(h.device),
        ahead,
      }
    : {
        label: `${who} went back to ${at} · Jump there`,
        shortLabel: `Jump back to ${at}`,
        jumpLabel: writerPlace(h.device),
        ahead,
      };
}

/**
 * Which offer the player shows when more than one applies. The hand-off wins: it says this player's place is not the
 * latest, a place that could be lost; the sleep timer's "fell asleep" offer is a comfort within this player's own,
 * older listen, and it goes anyway once the newer place is taken (any move forgets it).
 */
export function offerToShow(o: { handoff: boolean; asleep: boolean }): 'handoff' | 'asleep' | null {
  return o.handoff ? 'handoff' : o.asleep ? 'asleep' : null;
}
