import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { EmptyState, PillButton, Sheet } from '@joepittsy/ui';
import { ITEM_SESSIONS_LIMIT, useItemSessions } from '../api/history';
import { fmtClock } from '../screens/bookHelpers';
import {
  chapterSpan,
  dayLabel,
  deviceNotes,
  fmtListened,
  fmtTimeOfDay,
  fmtTimeRange,
  listeningDay,
  NIGHT_ENDS_AT_HOUR,
} from '../screens/historyHelpers';
import { useNow } from '../screens/useNow';
import { historyEntries, type HistoryEntry, type JumpEntry } from './bookHistory';
import { chapterIndexAt, type Chapter } from './chapters';
import { usePlayer } from './engine';
import { useJumpMarks } from './jumpLog';
import { jumpLabel } from './jumps';
import { usePlayerJump } from './useUndoableJump';
import styles from './HistorySheet.module.css';

/** This book's listening: each session from where it began to where it stopped, and the places jumped away from. */
export function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="History">
      <HistoryList onClose={onClose} />
    </Sheet>
  );
}

const chapterName = (chapters: Chapter[], i: number) => chapters[i]?.title || `Chapter ${i + 1}`;

/** When an entry happened, for grouping: a session counts on the night it began. */
const startOf = (e: HistoryEntry) => (e.kind === 'session' ? e.startedAt : e.at);

/** Entries by listening day, newest day first, each day's entries in the order given. */
function byNight(entries: HistoryEntry[]): { key: string; items: HistoryEntry[] }[] {
  const days = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const key = listeningDay(startOf(e));
    days.set(key, [...(days.get(key) ?? []), e]);
  }
  return [...days].map(([key, items]) => ({ key, items }));
}

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
  const days = byNight(entries);
  // The device, only where the rows come from more than one: Safari and Storyshelf on one phone are one device.
  const note = deviceNotes(
    entries.flatMap((e) => (e.kind === 'session' ? [e.session] : [])),
    { apps: false }
  );
  const chapters = p.chapters;
  // With fewer than two chapters there are none to name, and the times say it all.
  const named = chapters.length >= 2;
  const chapterAt = (position: number) => (named ? chapterIndexAt(chapters, position) : -1);
  const nowChapter = chapterAt(p.position);
  // Today counts from the end of last night too.
  const today = now - NIGHT_ENDS_AT_HOUR * 3_600_000;
  const truncated = (sessions.data?.total ?? 0) > all.length && all.length >= ITEM_SESSIONS_LIMIT;

  const go = (position: number) => {
    jumpTo(position, jumpLabel(chapters, position));
    onClose();
  };
  /** A place to go to. `chapter` is the chapter it is named by, -1 for none; `quiet` for the end of a stretch. */
  const place = (position: number, chapter: number, name: string, quiet = false) => {
    const clock = fmtClock(position);
    return (
      <button
        type="button"
        className={quiet ? `${styles.place} ${styles.quiet}` : styles.place}
        onClick={() => go(position)}
        aria-label={chapter >= 0 ? `${name}: ${clock}, ${chapterName(chapters, chapter)}` : `${name}: ${clock}`}
      >
        <span className={styles.chip}>{clock}</span>
      </button>
    );
  };

  const jumpNote = (e: JumpEntry): string => {
    if (e.device) return 'Another device’s place';
    if (e.to === undefined) return 'Before a jump';
    const to = chapterAt(e.to);
    return `Before you jumped to ${to >= 0 ? `Ch ${to + 1}` : fmtClock(e.to)}`;
  };

  const row = (e: HistoryEntry): ReactNode => {
    if (e.kind === 'jump') {
      const i = chapterAt(e.position);
      return (
        <li key={e.key} className={styles.row}>
          {i >= 0 && <span className={styles.title}>{chapterName(chapters, i)}</span>}
          <span className={styles.when}>{fmtTimeOfDay(e.at)}</span>
          <span className={styles.places}>{place(e.position, i, 'Go back')}</span>
          <span className={styles.meta}>{jumpNote(e)}</span>
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
                {' '}
                <ArrowRight className={styles.arrow} aria-hidden="true" />
                <span className={styles.srOnly}>to</span> {chapterName(chapters, span.to)}
              </>
            )}
          </span>
        )}
        <span className={styles.when}>{fmtTimeRange(e.startedAt, e.at)}</span>
        <span className={styles.places}>
          {place(e.from, span?.from ?? -1, 'Go back to where this started')}
          <ArrowRight className={styles.arrow} aria-hidden="true" />
          {place(e.to, span?.to ?? -1, 'Go to where this stopped', true)}
        </span>
        <span className={styles.meta}>
          {device ? `${fmtListened(e.listened)} · ${device}` : fmtListened(e.listened)}
        </span>
      </li>
    );
  };

  let body: ReactNode;
  if (sessions.isPending)
    body = (
      <div className={styles.loading}>
        <span role="status" className={styles.srOnly}>
          Loading your listening
        </span>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.placeholder} aria-hidden="true">
            <span className={`skeleton ${styles.lineWide}`} />
            <span className={`skeleton ${styles.lineShort}`} />
          </div>
        ))}
      </div>
    );
  else if (sessions.isError && entries.length === 0)
    body = (
      <EmptyState
        title="Couldn’t load your listening"
        action={
          <PillButton variant="ghost" onClick={() => void sessions.refetch()}>
            Try again
          </PillButton>
        }
      >
        Check your connection, then try again.
      </EmptyState>
    );
  else if (entries.length === 0)
    body = (
      <EmptyState title="Nothing to go back to yet">
        Your listening in this book, and where you jump from, will show here.
      </EmptyState>
    );
  else
    body = (
      <>
        {sessions.isError && (
          <p className={styles.notice}>
            Couldn’t load your listening, only the places kept on this device.{' '}
            <button type="button" className={styles.link} onClick={() => void sessions.refetch()}>
              Try again
            </button>
          </p>
        )}
        {days.map((d) => (
          <div key={d.key} className={styles.day}>
            <h3 className={styles.dayHead}>{dayLabel(d.key, today)}</h3>
            <ul className={styles.list}>{d.items.map(row)}</ul>
          </div>
        ))}
        {truncated && <p className={styles.notice}>Showing your latest {all.length} sessions in this book.</p>}
      </>
    );

  return (
    <div className={styles.history}>
      <div className={`${styles.row} ${styles.now}`} role="group" aria-label="Where you are now">
        {nowChapter >= 0 && <span className={styles.title}>{chapterName(chapters, nowChapter)}</span>}
        <span className={styles.when}>Now</span>
        <span className={styles.places}>
          <span className={styles.here}>{fmtClock(p.position)}</span>
        </span>
      </div>
      {body}
    </div>
  );
}
