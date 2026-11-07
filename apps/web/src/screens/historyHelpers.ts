import type { Chapter } from '../api/items';
import type { ListeningSession, SessionDevice } from '../api/history';
import { fmtClock } from './bookHelpers';

// Pure helpers for the listening history. Every date function takes an optional IANA time zone; left out, it is the
// device's own zone, which is what the screens want. Tests pass one so they do not depend on the machine.

const parts = (ms: number, tz: string | undefined, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', ...opts })
      .formatToParts(ms)
      .map((p) => [p.type, p.value])
  );

/** The local calendar day of an instant, as "YYYY-MM-DD". */
export function dayKey(ms: number, tz?: string): string {
  const p = parts(ms, tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Calendar arithmetic on a day key. Noon UTC, so no daylight-saving edge can move it. */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Consecutive runs by local day, in the order given (the log arrives newest first). */
export function groupByDay<T>(items: T[], at: (item: T) => number, tz?: string): { key: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = [];
  for (const item of items) {
    const key = dayKey(at(item), tz);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** "Today", "Yesterday", then "Mon 2 Nov", with the year when it is not this one. */
export function dayLabel(key: string, now: number, tz?: string): string {
  const today = dayKey(now, tz);
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  const noon = Date.parse(`${key}T12:00:00Z`);
  const p = parts(noon, 'UTC', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const base = `${p.weekday} ${p.day} ${p.month}`;
  return key.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${p.year}`;
}

/** "21:40", 24-hour, in the local zone. */
export function fmtTimeOfDay(ms: number, tz?: string): string {
  const p = parts(ms, tz, { hour: '2-digit', minute: '2-digit' });
  return `${p.hour}:${p.minute}`;
}

/** "1 Nov", or "3 Oct 2026" when `year` is 'always' or the year is not this one. */
export function fmtDate(ms: number, now: number, year: 'auto' | 'always' = 'auto', tz?: string): string {
  const p = parts(ms, tz, { day: 'numeric', month: 'short', year: 'numeric' });
  const base = `${p.day} ${p.month}`;
  return year === 'always' || p.year !== parts(now, tz, { year: 'numeric' }).year ? `${base} ${p.year}` : base;
}

/**
 * "48 min", "1h 05m", "6h 40m". Rounded to the minute; under half a minute is "under 1 min", in words because a "<"
 * reads as a back chevron at a glance. The spaces don't break, so a narrow duration column can't wrap it.
 */
export function fmtListened(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s > 0 && s < 30) return 'under 1 min';
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/**
 * The Stats page's headline cards, above the year in review. The review owns this year's total, so a period is left
 * out when it would only say that again (no listening this year before it), or say the shorter period inside it again;
 * so is a zero, which the daily map already shows. All time waits for listening from an earlier year (`earlier`):
 * until then it is this year too. A new listener gets no cards at all, and the review says it once.
 */
export function statCards(
  totals: { week: number; month: number; year: number },
  allTime: number,
  earlier: boolean
): { label: string; value: string }[] {
  const { week, month, year } = totals;
  const cards: { label: string; value: string }[] = [];
  if (week > 0 && week !== year) cards.push({ label: 'This week', value: fmtListened(week) });
  if (month > 0 && month !== week && month !== year) cards.push({ label: 'This month', value: fmtListened(month) });
  if (earlier && allTime > 0) cards.push({ label: 'All time', value: fmtListened(allTime) });
  return cards;
}

/** True when any listening fell before 1 January of today's year, so all time is more than this year. */
export function listenedBeforeThisYear(days: Record<string, number>, todayKey: string): boolean {
  const jan1 = `${todayKey.slice(0, 4)}-01-01`;
  return Object.entries(days).some(([k, v]) => v > 0 && k < jan1);
}

/**
 * "Ch 7 → Ch 9" for what a session covered, or "Ch 7" within one chapter. The start counts in the chapter it begins
 * in; an end exactly on a boundary belongs to the chapter that just finished. With fewer than two chapters there is
 * nothing to name, so it is the time range, "0:12:00 → 0:45:10".
 */
export function chapterRange(chapters: Chapter[], startTime: number, endTime: number): string {
  if (chapters.length < 2) return `${fmtClock(startTime)} → ${fmtClock(endTime)}`;
  const last = chapters.length - 1;
  const lastEnd = chapters[last]!.end;
  const from =
    startTime >= lastEnd
      ? last
      : Math.max(
          0,
          chapters.findIndex((c) => startTime >= c.start && startTime < c.end)
        );
  const hit = chapters.findIndex((c) => endTime > c.start && endTime <= c.end);
  const to = endTime <= startTime ? from : hit >= 0 ? hit : endTime > lastEnd ? last : from;
  return from === to ? `Ch ${from + 1}` : `Ch ${from + 1} → Ch ${to + 1}`;
}

type DeviceInfo = {
  clientName?: string | null;
  model?: string | null;
  osName?: string | null;
  deviceType?: string | null;
  browserName?: string | null;
} | null;

/** The hardware (a phone's model, else its OS) and the app of a session's device; '' for what is missing. */
function deviceParts(info?: DeviceInfo): { hardware: string; app: string } {
  if (!info) return { hardware: '', app: '' };
  const os =
    info.osName === 'iOS'
      ? info.deviceType === 'tablet'
        ? 'iPad'
        : info.deviceType === 'mobile'
          ? 'iPhone'
          : 'iOS'
      : info.osName;
  // ABS names its own clients "Abs Web", "Abs iOS": the browser is the more useful name there.
  const app =
    info.clientName && !/^abs /i.test(info.clientName) ? info.clientName : info.browserName || info.clientName;
  return { hardware: info.model || os || '', app: app || '' };
}

const joinParts = (parts: string[]) => parts.filter((x, i, a) => !!x && a.indexOf(x) === i).join(' · ');

/** Hardware first, then the app. "iPhone · Storyshelf". Missing fields are skipped. */
export function deviceLabel(info?: DeviceInfo): string {
  const { hardware, app } = deviceParts(info);
  return joinParts([hardware, app]);
}

/** The Monday of the week holding `key`. */
export function weekStart(key: string): string {
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

const sumWhere = (days: Record<string, number>, keep: (k: string) => boolean) =>
  Object.entries(days).reduce((t, [k, v]) => (keep(k) ? t + v : t), 0);

/** Seconds listened this week (Monday start), this month and this year, from ABS's per-day map. */
export function periodTotals(days: Record<string, number>, todayKey: string) {
  const mon = weekStart(todayKey);
  const sun = addDays(mon, 6);
  return {
    week: sumWhere(days, (k) => k >= mon && k <= sun),
    month: sumWhere(days, (k) => k.slice(0, 7) === todayKey.slice(0, 7)),
    year: sumWhere(days, (k) => k.slice(0, 4) === todayKey.slice(0, 4)),
  };
}

export interface HeatCell {
  key: string;
  /** Seconds listened; null for a day that hasn't happened yet. */
  seconds: number | null;
}

/** `weeks` columns of Monday-to-Sunday cells ending with the current week, plus a month name over the first column of each month. */
export function heatGrid(days: Record<string, number>, todayKey: string, weeks = 53) {
  const lastMonday = weekStart(todayKey);
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(lastMonday, (i - weeks + 1) * 7));
  const monthOf = (k: string) => k.slice(0, 7);
  const names = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
  const columns = mondays.map((m, i) =>
    // The first column stays blank: its name would hang off the left edge.
    i > 0 && monthOf(m) !== monthOf(mondays[i - 1]!) ? names.format(Date.parse(`${m}T12:00:00Z`)) : ''
  );
  const rows: HeatCell[][] = Array.from({ length: 7 }, (_, dow) =>
    mondays.map((m) => {
      const key = addDays(m, dow);
      return { key, seconds: key > todayKey ? null : (days[key] ?? 0) };
    })
  );
  return { columns, rows };
}

/** 1 to RAMP_STEPS-1: any listening shows a visible step, the busiest day the darkest. */
export function heatLevel(seconds: number, max: number, steps = 9): number {
  if (seconds <= 0 || max <= 0) return 0;
  return Math.min(steps - 1, 1 + Math.floor((seconds / max) * (steps - 1)));
}

interface StatsItem {
  timeListening: number;
  mediaMetadata?: { title?: string; authors?: { name?: string }[] } | null;
}

/** Books by time listened, most first. */
export function topBooks(items: Record<string, StatsItem & { id?: string }>, n: number) {
  return Object.entries(items)
    .map(([id, i]) => ({ id: i.id ?? id, title: i.mediaMetadata?.title || 'Untitled', seconds: i.timeListening }))
    .filter((b) => b.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, n);
}

/** Authors by time listened, most first. A book with several authors counts in full towards each. */
export function topAuthors(items: Record<string, StatsItem>, n: number) {
  const totals = new Map<string, number>();
  for (const i of Object.values(items))
    for (const a of i.mediaMetadata?.authors ?? [])
      if (a.name) totals.set(a.name, (totals.get(a.name) ?? 0) + i.timeListening);
  return [...totals]
    .map(([name, seconds]) => ({ name, seconds }))
    .filter((a) => a.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, n);
}

/** Sessions of one book on one device closer together than this are one sitting. */
export const MERGE_GAP_MS = 10 * 60 * 1000;

/** One or more sessions of the same book and device, read as a single sitting. */
export interface Sitting {
  /** The id of the newest session. */
  id: string;
  libraryItemId: string | null;
  displayTitle: string;
  deviceInfo?: SessionDevice | null;
  /** Epoch ms of the first session's start, and of the last one's end. */
  startedAt: number;
  endedAt: number;
  /** Book seconds where the sitting began and ended. */
  startTime: number;
  currentTime: number;
  /** Seconds heard, summed. */
  timeListening: number;
  /** How many sessions it folds together. */
  count: number;
}

const endOf = (s: ListeningSession) => Math.max(s.updatedAt, s.startedAt);

/**
 * Folds the log (newest first) into sittings: a session joins the one just after it when it is the same book on the
 * same device and ended within ten minutes of that one starting. A pause and a resume, or a dropped connection, is one
 * row, not three. Only neighbours merge, so the order of the log is kept.
 */
export function mergeSessions(sessions: ListeningSession[], gapMs = MERGE_GAP_MS): Sitting[] {
  const out: Sitting[] = [];
  const devices: string[] = [];
  for (const s of sessions) {
    const device = deviceLabel(s.deviceInfo);
    const last = out[out.length - 1];
    if (
      last &&
      s.libraryItemId !== null &&
      last.libraryItemId === s.libraryItemId &&
      devices[devices.length - 1] === device &&
      last.startedAt - endOf(s) <= gapMs
    ) {
      // `s` is older than the sitting so far: it moves the start back and adds its time.
      last.startedAt = Math.min(last.startedAt, s.startedAt);
      last.startTime = s.startTime;
      last.timeListening += s.timeListening;
      last.count += 1;
      continue;
    }
    out.push({
      id: s.id,
      libraryItemId: s.libraryItemId,
      displayTitle: s.displayTitle,
      deviceInfo: s.deviceInfo,
      startedAt: s.startedAt,
      endedAt: endOf(s),
      startTime: s.startTime,
      currentTime: s.currentTime,
      timeListening: s.timeListening,
      count: 1,
    });
    devices.push(device);
  }
  return out;
}

/** "18:13–18:21", or just "18:13" when it ended in the same minute. */
export function fmtTimeRange(startMs: number, endMs: number, tz?: string): string {
  const a = fmtTimeOfDay(startMs, tz);
  const b = fmtTimeOfDay(endMs, tz);
  return a === b ? a : `${a}–${b}`;
}

/**
 * The note for each row's device, naming only what tells the rows in view apart: the hardware when there is more than
 * one, the app when there is more than one. A device on every row ("· Storyshelf" six times) says nothing. A row with no
 * device is not a difference, and gets no note.
 */
export function deviceNotes(
  sessions: { deviceInfo?: SessionDevice | null }[]
): (info?: SessionDevice | null) => string | undefined {
  const parts = sessions.map((s) => deviceParts(s.deviceInfo));
  const varies = (key: 'hardware' | 'app') => new Set(parts.map((p) => p[key]).filter(Boolean)).size > 1;
  const hardware = varies('hardware');
  const app = varies('app');
  return (info) => {
    const p = deviceParts(info);
    return joinParts([hardware ? p.hardware : '', app ? p.app : '']) || undefined;
  };
}

/** The last `n` days, today first: the days map has no entry for a day with no listening, so it is 0. */
export function recentDays(days: Record<string, number>, todayKey: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const key = addDays(todayKey, -i);
    return { key, seconds: days[key] ?? 0 };
  });
}

/** Days since the first day with any listening, today counting as 1; 0 with no listening at all. */
export function daysOfHistory(days: Record<string, number>, todayKey: string): number {
  const first = Object.entries(days)
    .filter(([, v]) => v > 0)
    .map(([k]) => k)
    .sort()[0];
  if (!first) return 0;
  return Math.round((Date.parse(`${todayKey}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000) + 1;
}
