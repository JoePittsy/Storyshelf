import { chapterIndexAt, chapterMarkers, type Chapter } from './chapters';
import type { SleepTimer } from './sleep';

export type ProgressMode = 'book' | 'chapter' | 'sleep';

export interface WindowInput {
  /** Book seconds. */
  position: number;
  duration: number;
  chapters: Chapter[];
  sleep: SleepTimer | null;
  /** Book seconds when the sleep timer was set or changed. */
  sleepFrom: number;
  rate: number;
}

export interface ProgressWindow {
  /** Book seconds the bar starts and ends at. The UI shows `position - start` over `end - start`. */
  start: number;
  end: number;
  seekable: boolean;
  /** Ticks for SeekBar: milliseconds from `start`. */
  markers: { at: number; label: string }[];
  /** Replaces the times ("Stops in 12:30"); undefined for the usual elapsed / total. */
  label?: string;
}

const clock = (seconds: number): string => {
  const s = Math.ceil(Math.max(0, seconds));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

/** The mode actually shown: Sleep needs an active timer, otherwise the previously chosen mode. */
export function resolveMode(mode: ProgressMode, fallback: ProgressMode, sleepActive: boolean): ProgressMode {
  return mode === 'sleep' && !sleepActive ? (fallback === 'sleep' ? 'book' : fallback) : mode;
}

/** Book seconds where the sleep timer will stop playback, or null with no timer. Minutes timers count real time, so the rate scales it. */
export function sleepStopAt(sleep: SleepTimer | null, position: number, rate: number): number | null {
  if (!sleep) return null;
  return sleep.kind === 'chapter' ? sleep.endsAt : position + (sleep.remainingMs / 1000) * rate;
}

/** The stretch of the book the progress bar spans in each mode, in book seconds. */
export function progressWindow(mode: ProgressMode, i: WindowInput): ProgressWindow {
  const { position, duration, chapters, sleep, rate } = i;
  const book: ProgressWindow = { start: 0, end: duration, seekable: duration > 0, markers: chapterMarkers(chapters) };

  if (mode === 'chapter' && chapters.length > 0) {
    // The chapter holding the position. In a gap (or before the first chapter, or past the last) the bar spans the gap.
    const cur = chapters[chapterIndexAt(chapters, position)];
    const from = cur ? cur.start : Math.max(0, ...chapters.filter((c) => c.end <= position).map((c) => c.end));
    const rawEnd = cur
      ? cur.end
      : Math.min(duration > 0 ? duration : Infinity, ...chapters.filter((c) => c.start > position).map((c) => c.start));
    const to = duration > 0 ? Math.min(rawEnd, duration) : rawEnd;
    return { start: from, end: to, seekable: to > from, markers: [] };
  }

  const stop = sleepStopAt(sleep, position, rate);
  if (mode === 'sleep' && sleep && stop !== null) {
    const start = Math.min(Number.isFinite(i.sleepFrom) ? i.sleepFrom : position, position);
    const end = Math.max(duration > 0 ? Math.min(stop, duration) : stop, position);
    const left = sleep.kind === 'minutes' ? sleep.remainingMs / 1000 : (stop - position) / Math.max(rate, 0.1);
    return { start, end, seekable: false, markers: [], label: `Stops in ${clock(left)}` };
  }
  return book;
}
