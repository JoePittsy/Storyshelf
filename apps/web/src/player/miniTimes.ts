import { fmtLeft, fmtRemaining } from '@joepittsy/ui';
import type { Chapter } from './chapters';
import type { PlayerState } from './engine';
import { sleepRemainingMs } from './sleep';

type Input = Pick<PlayerState, 'position' | 'duration' | 'chapterIndex' | 'sleep' | 'rate'> & { chapters: Chapter[] };

/** "Stops in 12:30" while a sleep timer runs, otherwise undefined. The mini player and car mode both say it this way. */
export function sleepStopsIn(sleep: PlayerState['sleep'], position: number, rate: number): string | undefined {
  return sleep ? `Stops in ${fmtRemaining(sleepRemainingMs(sleep, position, rate))}` : undefined;
}

/**
 * The mini player's times, in words rather than clocks ("Time, not tracks"). `remaining` sits after the chapter name
 * at every width: the time left in the chapter ("3m left in chapter"), or the book's time left ("57m left") when there
 * is no chapter to name. `side` is the wide
 * bar's readout: when a sleep timer will stop playback, otherwise the book's time left. A book with no chapters has
 * already said that, so `side` is left out and the bar keeps its own clock.
 */
export function miniPlayerTimes({ position, duration, chapters, chapterIndex, sleep, rate }: Input): {
  remaining: string | undefined;
  side: string | undefined;
} {
  const chapter = chapters[chapterIndex];
  const bookLeft = duration > 0 ? fmtLeft((duration - position) * 1000) : undefined;
  const remaining = chapter ? `${fmtLeft((chapter.end - position) * 1000)} in chapter` : bookLeft;
  const stops = sleepStopsIn(sleep, position, rate);
  return { remaining, side: stops ?? (chapters.length > 0 && bookLeft ? `${bookLeft} in book` : undefined) };
}
