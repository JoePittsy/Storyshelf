import { useEffect, useRef } from 'react';
import { ListRow, Sheet } from '@joepittsy/ui';
import { fmtClock } from '../screens/bookHelpers';
import { usePlayer } from './engine';
import { usePlayerJump } from './useUndoableJump';
import styles from './ChaptersSheet.module.css';

/** The chapter list for the playing book: choosing one seeks to it and closes. Shared by the full and mini players. */
export function ChaptersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePlayer();
  const { jumpTo } = usePlayerJump();
  const list = useRef<HTMLUListElement>(null);
  // Open at the chapter you are in, not the top of a long list.
  useEffect(() => {
    if (open) list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Chapters" doneLabel="Done">
      <ul ref={list} className={styles.chapters}>
        {p.chapters.map((c, i) => (
          <ListRow
            key={c.id}
            // The number is a column of its own: hidden from assistive tech so a name isn't read as "101 - …".
            lead={<span aria-hidden="true">{i + 1}</span>}
            title={c.title}
            aside={fmtClock(c.start)}
            asideWideOnly
            trailing={fmtClock(c.end - c.start, false)}
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
