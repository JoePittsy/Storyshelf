import { useId, useState } from 'react';
import { ActivityRow, EmptyState, PillButton, SectionCard } from '@joepittsy/ui';
import type { BookItem } from '../api/items';
import { useItemSessions, useListeningStats } from '../api/history';
import {
  chapterRange,
  dayLabel,
  dayKey,
  fmtDate,
  fmtListened,
  fmtTimeOfDay,
  deviceNotes,
} from '../screens/historyHelpers';
import { useNow } from '../screens/useNow';
import styles from './BookListening.module.css';

/** Sessions shown before "Show all". */
export const LATEST_SESSIONS = 5;

/**
 * "Your listening" on a book page, as one line: when it was started (and finished), time listened and how many
 * sessions. The sessions themselves are behind an expander, since most visits only want to get on with the book.
 */
export function BookListening({ item }: { item: BookItem }) {
  const now = useNow();
  const sessions = useItemSessions(item.id);
  const stats = useListeningStats();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const listId = useId();

  const p = item.userMediaProgress;
  const list = sessions.data?.sessions ?? [];
  const total = sessions.data?.total ?? 0;
  // Time listened across every session: the stats map is exact however many sessions there are.
  const listened = stats.data?.items[item.id]?.timeListening ?? list.reduce((t, s) => t + s.timeListening, 0);

  if (sessions.isError && !p?.startedAt) return null;
  if (sessions.isPending || (total === 0 && !p?.startedAt)) return null;

  const summary = [
    p?.startedAt ? `Started ${fmtDate(p.startedAt, now)}` : null,
    p?.isFinished && p.finishedAt ? `Finished ${fmtDate(p.finishedAt, now)}` : null,
    listened > 0 ? `${fmtListened(listened)} listened` : null,
    total > 0 ? `${total} ${total === 1 ? 'session' : 'sessions'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const shown = all ? list : list.slice(0, LATEST_SESSIONS);
  const note = deviceNotes(list);

  return (
    <SectionCard title="Your listening" className={styles.section}>
      <div className={styles.summary}>
        <p className={styles.line}>{summary}</p>
        {list.length > 0 && (
          <PillButton aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
            {open ? 'Hide sessions' : 'Show sessions'}
          </PillButton>
        )}
      </div>
      {list.length > 0 && open && (
        <div id={listId}>
          <ul className={styles.list} aria-label="Sessions, newest first">
            {shown.map((s) => (
              <ActivityRow
                key={s.id}
                showArt={false}
                title={`${dayLabel(dayKey(s.startedAt), now)} · ${fmtTimeOfDay(s.startedAt)}`}
                detail={chapterRange(item.media.chapters, s.startTime, s.currentTime)}
                note={note(s.deviceInfo)}
                trailing={fmtListened(s.timeListening)}
              />
            ))}
          </ul>
          {list.length > LATEST_SESSIONS && (
            <PillButton className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${list.length} sessions`}
            </PillButton>
          )}
        </div>
      )}
      {list.length === 0 && total === 0 && (
        <EmptyState title="No sessions recorded">
          Sessions appear here once you listen in Storyshelf or another app.
        </EmptyState>
      )}
    </SectionCard>
  );
}
