import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { EmptyState, Sheet } from '@joepittsy/ui';
import { useItemSessions } from '../api/history';
import { fmtClock } from '../screens/bookHelpers';
import {
  chapterSpan,
  dayLabel,
  deviceNotes,
  fmtListened,
  fmtTimeOfDay,
  fmtTimeRange,
  groupByDay,
} from '../screens/historyHelpers';
import { useNow } from '../screens/useNow';
import { historyEntries, type HistoryEntry } from './bookHistory';
import { chapterIndexAt, type Chapter } from './chapters';
import { usePlayer } from './engine';
import { useJumpMarks } from './jumpLog';
import { jumpLabel } from './jumps';
import { usePlayerJump } from './useUndoableJump';
import styles from './HistorySheet.module.css';

/** This book's listening: each session from where it began to where it stopped, and where this visit jumped from. */
export function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="History" doneLabel="Done">
      <HistoryList onClose={onClose} />
    </Sheet>
  );
}

const chapterName = (chapters: Chapter[], i: number) => chapters[i]?.title || `Chapter ${i + 1}`;

// Its own component so the sessions are only fetched while the sheet is open.
function HistoryList({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const now = useNow();
  const { jumpTo } = usePlayerJump();
  const id = p.item?.id ?? '';
  const sessions = useItemSessions(id);
  const jumps = useJumpMarks(id);
  const all = sessions.data?.sessions ?? [];
  const entries = historyEntries({ itemId: id, sessions: all, jumps, position: p.position });
  const days = groupByDay(entries, (e) => e.at);
  // The device, only where the rows are from more than one.
  const note = deviceNotes(entries.flatMap((e) => (e.kind === 'session' ? [e.session] : [])));
  const chapters = p.chapters;
  // With fewer than two chapters there are none to name, and the times say it all.
  const named = chapters.length >= 2;
  const nowChapter = named ? chapterIndexAt(chapters, p.position) : -1;

  const go = (position: number) => {
    jumpTo(position, jumpLabel(chapters, position));
    onClose();
  };
  const place = (position: number) => {
    const i = named ? chapterIndexAt(chapters, position) : -1;
    const clock = fmtClock(position);
    return (
      <button
        type="button"
        className={styles.place}
        onClick={() => go(position)}
        aria-label={i >= 0 ? `Go to ${clock}, ${chapterName(chapters, i)}` : `Go to ${clock}`}
      >
        <span className={styles.chip}>{clock}</span>
      </button>
    );
  };

  const row = (e: HistoryEntry): ReactNode => {
    if (e.kind === 'jump') {
      const i = named ? chapterIndexAt(chapters, e.position) : -1;
      return (
        <li key={e.key} className={styles.row}>
          {i >= 0 && <span className={styles.title}>{chapterName(chapters, i)}</span>}
          <span className={styles.when}>{fmtTimeOfDay(e.at)}</span>
          <span className={styles.places}>{place(e.position)}</span>
          <span className={styles.meta}>Before a jump</span>
        </li>
      );
    }
    const span = chapterSpan(chapters, e.from, e.to);
    const device = note(e.session.deviceInfo);
    return (
      <li key={e.key} className={styles.row}>
        {span && (
          <span className={styles.title}>
            {chapterName(chapters, span.from)}
            {span.to !== span.from && (
              <>
                <ArrowRight className={styles.arrow} aria-hidden="true" />
                <span className={styles.srOnly}> to </span>
                {chapterName(chapters, span.to)}
              </>
            )}
          </span>
        )}
        <span className={styles.when}>{fmtTimeRange(e.startedAt, e.at)}</span>
        <span className={styles.places}>
          {place(e.from)}
          <ArrowRight className={styles.arrow} aria-hidden="true" />
          {place(e.to)}
        </span>
        <span className={styles.meta}>
          {device ? `${fmtListened(e.listened)} · ${device}` : fmtListened(e.listened)}
        </span>
      </li>
    );
  };

  return (
    <div className={styles.history} aria-busy={sessions.isPending}>
      <div className={`${styles.row} ${styles.now}`}>
        {nowChapter >= 0 && <span className={styles.title}>{chapterName(chapters, nowChapter)}</span>}
        <span className={styles.when}>Now</span>
        <span className={styles.places}>
          <span className={styles.here}>{fmtClock(p.position)}</span>
        </span>
      </div>
      {entries.length === 0 && !sessions.isPending ? (
        <EmptyState title="Nothing to go back to yet">
          Your listening in this book, and where you jump from, will show here.
        </EmptyState>
      ) : (
        days.map((d) => (
          <section key={d.key} aria-labelledby={`history-${d.key}`} className={styles.day}>
            <h3 id={`history-${d.key}`} className={styles.dayHead}>
              {dayLabel(d.key, now)}
            </h3>
            <ul className={styles.list}>{d.items.map(row)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
