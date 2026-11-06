import { useState } from 'react';
import { ActivityRow, EmptyState, PillButton, SectionCard, StatGrid } from '@joepittsy/ui';
import type { Stat } from '@joepittsy/ui';
import type { BookItem } from '../api/items';
import { useItemSessions, useListeningStats } from '../api/history';
import {
  chapterRange,
  dayLabel,
  deviceLabel,
  dayKey,
  fmtDate,
  fmtListened,
  fmtTimeOfDay,
} from '../screens/historyHelpers';
import { useNow } from '../screens/useNow';
import styles from './BookListening.module.css';

/** Sessions shown before "Show all". */
export const LATEST_SESSIONS = 5;

/** "Your listening" on a book page: when it was started and finished, time listened, and the latest sessions. */
export function BookListening({ item }: { item: BookItem }) {
  const now = useNow();
  const sessions = useItemSessions(item.id);
  const stats = useListeningStats();
  const [all, setAll] = useState(false);

  const p = item.userMediaProgress;
  const list = sessions.data?.sessions ?? [];
  const total = sessions.data?.total ?? 0;
  // Time listened across every session: the stats map is exact however many sessions there are.
  const listened = stats.data?.items[item.id]?.timeListening ?? list.reduce((t, s) => t + s.timeListening, 0);

  if (sessions.isError && !p?.startedAt) return null;
  if (sessions.isPending || (total === 0 && !p?.startedAt)) return null;

  const facts: Stat[] = [
    ...(p?.startedAt ? [{ label: 'Started', value: fmtDate(p.startedAt, now) }] : []),
    ...(p?.isFinished && p.finishedAt ? [{ label: 'Finished', value: fmtDate(p.finishedAt, now) }] : []),
    ...(listened > 0 ? [{ label: 'Listened', value: fmtListened(listened) }] : []),
    ...(total > 0 ? [{ label: 'Sessions', value: String(total) }] : []),
  ];
  const shown = all ? list : list.slice(0, LATEST_SESSIONS);

  return (
    <SectionCard title="Your listening" className={styles.section}>
      {facts.length > 0 && <StatGrid items={facts} />}
      {list.length > 0 && (
        <>
          <ul className={styles.list} aria-label="Sessions, newest first">
            {shown.map((s) => (
              <ActivityRow
                key={s.id}
                showArt={false}
                title={`${dayLabel(dayKey(s.startedAt), now)} · ${fmtTimeOfDay(s.startedAt)}`}
                detail={chapterRange(item.media.chapters, s.startTime, s.currentTime)}
                note={deviceLabel(s.deviceInfo) || undefined}
                trailing={fmtListened(s.timeListening)}
              />
            ))}
          </ul>
          {list.length > LATEST_SESSIONS && (
            <PillButton className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${list.length} sessions`}
            </PillButton>
          )}
        </>
      )}
      {list.length === 0 && total === 0 && (
        <EmptyState title="No sessions recorded">Sessions appear here once you listen in Storyshelf or another app.</EmptyState>
      )}
    </SectionCard>
  );
}
