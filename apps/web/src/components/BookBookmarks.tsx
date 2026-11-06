import { useId, useState } from 'react';
import { ActivityRow, PillButton, SectionCard } from '@joepittsy/ui';
import { useBookmarks, type Bookmark } from '../api/bookmarks';
import type { BookItem } from '../api/items';
import { bookmarkChapter } from '../player/bookmarks';
import { fmtClock } from '../screens/bookHelpers';
import styles from './BookListening.module.css';

/** Bookmarks shown before "Show all". */
export const FIRST_BOOKMARKS = 5;

/** A book's bookmarks, in book order, on its page: choosing one plays the book from there. Nothing when it has none. */
export function BookBookmarks({ item, onOpen }: { item: BookItem; onOpen: (b: Bookmark) => void }) {
  const { data: list = [] } = useBookmarks(item.id);
  const [all, setAll] = useState(false);
  const listId = useId();
  if (list.length === 0) return null;
  const shown = all ? list : list.slice(0, FIRST_BOOKMARKS);
  return (
    <SectionCard title="Bookmarks" className={styles.section}>
      <ul id={listId} className={styles.list} aria-label="Bookmarks, in book order">
        {shown.map((b) => (
          <ActivityRow
            key={`${b.libraryItemId}@${b.time}`}
            showArt={false}
            title={b.title}
            detail={bookmarkChapter(item.media.chapters, b)}
            trailing={fmtClock(b.time)}
            onOpen={() => onOpen(b)}
          />
        ))}
      </ul>
      {list.length > FIRST_BOOKMARKS && (
        <PillButton className={styles.more} aria-expanded={all} aria-controls={listId} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${list.length} bookmarks`}
        </PillButton>
      )}
    </SectionCard>
  );
}
