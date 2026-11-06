import { useRef, useState } from 'react';
import { ActionRow, EmptyState, PillButton, Sheet } from '@joepittsy/ui';
import { useAddBookmark, useBookmarks, useDeleteBookmark, useRenameBookmark, type Bookmark } from '../api/bookmarks';
import { fmtClock } from '../screens/bookHelpers';
import { bookmarkChapter, bookmarkSecond } from './bookmarks';
import { usePlayer } from './engine';
import { RenameBookmarkDialog } from './RenameBookmarkDialog';
import { useBookmarkHere } from './useBookmarkHere';
import { usePlayerJump } from './useUndoableJump';
import styles from './BookmarksSheet.module.css';

/**
 * The playing book's bookmarks, in time order: choosing one jumps there (with Undo) and closes. Rows can be renamed
 * and deleted. The rename dialog sits beside the sheet, not inside it, so its events never reach the sheet.
 */
export function BookmarksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [renaming, setRenaming] = useState<Bookmark | null>(null);
  const { mutate: rename } = useRenameBookmark();
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Bookmarks" doneLabel="Done">
        <BookmarkList onClose={onClose} onRename={setRenaming} />
      </Sheet>
      {renaming && (
        <RenameBookmarkDialog
          title={renaming.title}
          onSave={(title) => rename({ libraryItemId: renaming.libraryItemId, time: renaming.time, title })}
          onClose={() => setRenaming(null)}
        />
      )}
    </>
  );
}

const key = (b: Bookmark) => `${b.libraryItemId}@${b.time}`;

// Its own component, so the list is only read while the sheet is open, and deleted rows are forgotten when it closes.
function BookmarkList({ onClose, onRename }: { onClose: () => void; onRename: (b: Bookmark) => void }) {
  const p = usePlayer();
  const id = p.item?.id ?? '';
  const { data: list = [], isPending, isError, refetch } = useBookmarks(id);
  const { jumpTo } = usePlayerJump();
  const bookmarkHere = useBookmarkHere();
  const { mutateAsync: remove } = useDeleteBookmark();
  const { mutate: add } = useAddBookmark();
  // A toast can't be reached over the sheet, so a deleted row stays in its place with its own Undo until the sheet closes.
  const [deleted, setDeleted] = useState<Bookmark[]>([]);
  const forget = (b: Bookmark) => setDeleted((d) => d.filter((x) => key(x) !== key(b)));
  // Each delete on its way, so an Undo can wait for it rather than race it.
  const deleting = useRef(new Map<string, Promise<unknown>>());
  // The row just deleted: its Undo takes the focus the delete button had.
  const focusUndo = useRef<string | null>(null);

  const del = (b: Bookmark) => {
    focusUndo.current = key(b);
    setDeleted((d) => [...d, b]);
    // A failed delete is put back in the list by the data layer; its placeholder goes.
    deleting.current.set(
      key(b),
      remove(b).catch(() => forget(b))
    );
  };
  const undo = (b: Bookmark) => {
    forget(b);
    void (deleting.current.get(key(b)) ?? Promise.resolve()).then(() => add(b));
  };

  if (isPending) return <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading bookmarks" />;
  if (isError)
    return (
      <EmptyState
        title="Couldn't load your bookmarks"
        action={<PillButton onClick={() => void refetch()}>Try again</PillButton>}
      >
        Check your connection and try again.
      </EmptyState>
    );

  const rows = [...list.map((b) => ({ b, gone: false })), ...deleted.map((b) => ({ b, gone: true }))].sort(
    (x, y) => x.b.time - y.b.time
  );

  if (rows.length === 0)
    return (
      <EmptyState
        title="No bookmarks yet"
        action={
          <PillButton variant="primary" onClick={() => bookmarkHere({ quiet: true })}>
            Bookmark {fmtClock(bookmarkSecond(p.position), false)}
          </PillButton>
        }
      >
        Mark a place in this book to come back to it later. Bookmarks are kept on your server, so every device has them.
      </EmptyState>
    );

  return (
    <ul className={styles.list} aria-label="Bookmarks, in book order">
      {rows.map(({ b, gone }) =>
        gone ? (
          <li
            key={key(b)}
            className={styles.deleted}
            ref={(el) => {
              if (el && focusUndo.current === key(b)) {
                focusUndo.current = null;
                el.querySelector('button')?.focus();
              }
            }}
          >
            <span className={styles.deletedText}>Deleted “{b.title}”</span>
            <PillButton aria-label={`Undo deleting ${b.title}`} onClick={() => undo(b)}>
              Undo
            </PillButton>
          </li>
        ) : (
          <ActionRow
            key={key(b)}
            title={b.title}
            detail={bookmarkChapter(p.chapters, b)}
            trailing={fmtClock(b.time)}
            onOpen={() => {
              jumpTo(b.time, b.title);
              onClose();
            }}
            actions={[
              { icon: 'rename', label: `Rename ${b.title}`, onClick: () => onRename(b) },
              {
                icon: 'delete',
                label: `Delete ${b.title}`,
                onClick: () => del(b),
              },
            ]}
          />
        )
      )}
    </ul>
  );
}
