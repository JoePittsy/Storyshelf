import { ListRow, Sheet } from '@joepittsy/ui';
import { fmtClock } from '../screens/bookHelpers';
import { usePlayer } from './engine';
import { usePlayerJump } from './useUndoableJump';
import styles from './ChaptersSheet.module.css';

/** The chapter list for the playing book: choosing one seeks to it and closes. Shared by the full and mini players. */
export function ChaptersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePlayer();
  const { jumpTo } = usePlayerJump();
  return (
    <Sheet open={open} onClose={onClose} title="Chapters" doneLabel="Done">
      <ul className={styles.chapters}>
        {p.chapters.map((c, i) => (
          <ListRow
            key={c.id}
            title={c.title}
            aside={fmtClock(c.start)}
            current={i === p.chapterIndex}
            onClick={() => {
              jumpTo(c.start, `Chapter ${i + 1}`);
              onClose();
            }}
          />
        ))}
      </ul>
    </Sheet>
  );
}
