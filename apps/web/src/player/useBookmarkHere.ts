import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@joepittsy/ui';
import { BOOKMARKS_KEY, bookmarksQuery, useAddBookmark, useDeleteBookmark, type Bookmark } from '../api/bookmarks';
import { fmtClock } from '../screens/bookHelpers';
import { planBookmark, type BookmarkPlan } from './bookmarks';
import { usePlayer } from './engine';

/** Long enough to reach for Undo, like a jump's. */
const UNDO_MS = 8000;

/**
 * Bookmarks the playing book where it is, at the whole second, named after its chapter. The same second twice finds
 * the bookmark already there rather than making a second one. It confirms with a toast whose Undo deletes the new
 * bookmark; pass `quiet` where a toast can't be reached (inside a sheet, which shows the new row instead). The
 * returned function is stable and reads the player's latest state when called.
 */
export function useBookmarkHere() {
  const p = usePlayer();
  const latest = useRef(p);
  useEffect(() => {
    latest.current = p;
  });
  // Loaded while a book is in the player, so a press can tell a new place from one already marked.
  useQuery({ ...bookmarksQuery, enabled: !!p.item });
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { mutateAsync: add } = useAddBookmark();
  const { mutate: remove } = useDeleteBookmark();

  return useCallback(
    ({ quiet = false }: { quiet?: boolean } = {}): BookmarkPlan | null => {
      const { item, position, chapters } = latest.current;
      if (!item) return null;
      const plan = planBookmark(qc.getQueryData<Bookmark[]>(BOOKMARKS_KEY), item.id, position, chapters);
      if (plan.kind === 'exists') {
        if (!quiet)
          showToast(`Already bookmarked at ${fmtClock(plan.bookmark.time, false)}`, 'info', { replaceKey: 'bookmark' });
        return plan;
      }
      const b: Bookmark = { libraryItemId: item.id, time: plan.time, title: plan.title, createdAt: Date.now() };
      const added = add(b);
      added.catch(() =>
        showToast("Couldn't add the bookmark. Check your connection and try again.", 'error', {
          replaceKey: 'bookmark',
        })
      );
      if (!quiet)
        showToast(`Bookmark added at ${fmtClock(plan.time, false)}`, 'success', {
          action: {
            label: 'Undo',
            shortcutKey: 'u',
            // After the add has landed, so the delete can't overtake it and leave the bookmark behind.
            onClick: () =>
              void added.then(
                () => remove(b),
                () => undefined
              ),
          },
          durationMs: UNDO_MS,
          replaceKey: 'bookmark',
        });
      return plan;
    },
    [add, remove, qc, showToast]
  );
}
