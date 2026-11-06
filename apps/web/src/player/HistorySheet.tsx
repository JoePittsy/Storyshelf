import { ActivityRow, EmptyState, Sheet } from '@joepittsy/ui';
import { useItemSessions } from '../api/history';
import { fmtClock } from '../screens/bookHelpers';
import { dayKey, dayLabel, fmtTimeOfDay } from '../screens/historyHelpers';
import { useNow } from '../screens/useNow';
import { historyRows } from './bookHistory';
import { chapterIndexAt } from './chapters';
import { usePlayer } from './engine';
import { useJumpMarks } from './jumpLog';
import { jumpLabel } from './jumps';
import { usePlayerJump } from './useUndoableJump';
import styles from './HistorySheet.module.css';

/** Places in this book to go back to: where earlier sessions began and stopped, and where this visit jumped from. */
export function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="History" doneLabel="Done">
      <HistoryList onClose={onClose} />
    </Sheet>
  );
}

// Its own component so the sessions are only fetched while the sheet is open.
function HistoryList({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const now = useNow();
  const { jumpTo } = usePlayerJump();
  const id = p.item?.id ?? '';
  const sessions = useItemSessions(id);
  const jumps = useJumpMarks(id);
  const rows = historyRows({ itemId: id, sessions: sessions.data?.sessions ?? [], jumps, position: p.position, now });

  if (rows.length === 1 && !sessions.isPending)
    return (
      <EmptyState title="Nothing to go back to yet">
        Places you have listened to, and where you jump from, will show here.
      </EmptyState>
    );

  return (
    <ul className={styles.list} aria-label="Places in this book, newest first" aria-busy={sessions.isPending}>
      {rows.map((r) => {
        const i = chapterIndexAt(p.chapters, r.position);
        const chapter = i >= 0 ? p.chapters[i]?.title : undefined;
        return (
          <ActivityRow
            key={r.key}
            showArt={false}
            when={r.current ? 'Now' : `${dayLabel(dayKey(r.at), now)} ${fmtTimeOfDay(r.at)}`}
            title={chapter || fmtClock(r.position)}
            trailing={chapter ? fmtClock(r.position) : undefined}
            onOpen={
              r.current
                ? undefined
                : () => {
                    jumpTo(r.position, jumpLabel(p.chapters, r.position));
                    onClose();
                  }
            }
          />
        );
      })}
    </ul>
  );
}
