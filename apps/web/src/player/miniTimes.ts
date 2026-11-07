import { fmtLeft, fmtRemaining } from '@joepittsy/ui';
import type { Chapter } from './chapters';
import type { PlayerState } from './engine';
import { sleepRemainingMs } from './sleep';

type Input = Pick<PlayerState, 'position' | 'duration' | 'chapterIndex' | 'sleep' | 'rate'> & { chapters: Chapter[] };

/**
 * The mini player's times, in words rather than clocks ("Time, not tracks"). `remaining` sits after the chapter name
 * at every width: the time left in the chapter, or in the book when there is no chapter to name. `side` is the wide
 * bar's readout: when a sleep timer will stop playback, otherwise the book's time left. A book with no chapters has
 * already said that, so `side` is left out and the bar keeps its own clock.
 */
export function miniPlayerTimes({ position, duration, chapters, chapterIndex, sleep, rate }: Input): {
  remaining: string | undefined;
  side: string | undefined;
} {
  const chapter = chapters[chapterIndex];
  const bookLeft = duration > 0 ? fmtLeft((duration - position) * 1000) : undefined;
  const remaining = chapter ? fmtLeft((chapter.end - position) * 1000) : bookLeft;
  const stops = sleep ? `Stops in ${fmtRemaining(sleepRemainingMs(sleep, position, rate))}` : undefined;
  return { remaining, side: stops ?? (chapters.length > 0 && bookLeft ? `${bookLeft} in book` : undefined) };
}
