// A book's progress record, edited directly: mark finished, mark not finished, reset, and put any of those back.
//
// ABS 2.37.2 behaviour these rely on (MediaProgress.applyProgressUpdate, User.createUpdateMediaProgressFromPayload,
// MeController; each checked against the running server):
//  - PATCH { isFinished: true } keeps `currentTime`, sets `progress` to 1 and stamps `finishedAt` (now, or the
//    `finishedAt` sent with it). It drops the book from /api/me/items-in-progress.
//  - PATCH { isFinished: false } on a finished book zeroes `currentTime` and `progress`, clears `finishedAt`, and
//    ignores any `currentTime` sent with it: a second PATCH has to put the place back.
//  - A `currentTime` change on a finished book un-finishes it (unless it lands in the last 10 seconds), so a finished
//    book's place has to be set before it is finished again, never after.
//  - DELETE /api/me/progress/:id takes the progress record's own id, not the library item's (that is a 404).
//  - A PATCH that creates the record honours `createdAt` (so `startedAt` comes back) and `finishedAt`; on an existing
//    record `createdAt` is ignored. Any PATCH can carry `lastUpdate`, which ABS writes over `updatedAt` after saving.
import { AbsError, absFetch } from '../api/auth';
import type { MediaProgress } from '../api/types';
import { patchProgress, type ProgressPatch } from './session';

/** Everything about a book's progress that an Undo has to put back. Times are ms since the epoch. */
export interface ProgressSnapshot {
  /** The progress record's id (what DELETE takes). A reset and its Undo give the record a new one. */
  id: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
  finishedAt: number | null;
  startedAt: number | null;
  lastUpdate: number | null;
  hideFromContinueListening: boolean;
  ebookLocation: string | null;
  ebookProgress: number | null;
}

type ProgressResponse = MediaProgress & { ebookLocation?: string | null; ebookProgress?: number | null };

const path = (id: string) => `/api/me/progress/${encodeURIComponent(id)}`;

/** The book's progress as the server has it now, or null when it has none. */
export async function getProgress(libraryItemId: string): Promise<ProgressSnapshot | null> {
  let p: ProgressResponse;
  try {
    p = await absFetch<ProgressResponse>(path(libraryItemId));
  } catch (e) {
    if (e instanceof AbsError && e.status === 404) return null;
    throw e;
  }
  return {
    id: p.id,
    currentTime: p.currentTime ?? 0,
    duration: p.duration ?? 0,
    progress: p.progress ?? 0,
    isFinished: !!p.isFinished,
    finishedAt: p.finishedAt ?? null,
    startedAt: p.startedAt ?? null,
    lastUpdate: p.lastUpdate ?? null,
    hideFromContinueListening: !!p.hideFromContinueListening,
    ebookLocation: p.ebookLocation ?? null,
    ebookProgress: p.ebookProgress ?? null,
  };
}

/** Marks the book finished (its place is kept) or not finished (ABS starts it again from the beginning). */
export const setFinished = (libraryItemId: string, isFinished: boolean): Promise<void> =>
  patchProgress(libraryItemId, { isFinished });

/** Deletes a progress record, by the record's own id. */
export const removeProgress = (progressId: string): Promise<void> =>
  absFetch<void>(path(progressId), { method: 'DELETE' });

/** The place, without letting ABS finish the book because the place is near its end. */
const placeOf = (s: ProgressSnapshot): ProgressPatch => ({
  currentTime: s.currentTime,
  ...(s.duration > 0 && { duration: s.duration }),
  ...(!s.isFinished && { progress: s.progress }),
  markAsFinishedTimeRemaining: 0,
});

/** The parts that only apply once the place is right; the last write, so `lastUpdate` is the one that sticks. */
const finishOf = (s: ProgressSnapshot): ProgressPatch => ({
  ...(s.isFinished && { isFinished: true, finishedAt: s.finishedAt }),
  hideFromContinueListening: s.hideFromContinueListening,
  ...(s.lastUpdate !== null && { lastUpdate: s.lastUpdate }),
  markAsFinishedTimeRemaining: 0,
});

/**
 * Puts the book's progress back as `prev` had it (null: no progress at all), whatever the server has now. Restores the
 * place, progress, finished state and time, started time, last update and the Continue listening flag; the one thing it
 * can't is the record's id after a reset.
 */
export async function restoreProgress(libraryItemId: string, prev: ProgressSnapshot | null): Promise<void> {
  const cur = await getProgress(libraryItemId);
  if (!prev) {
    if (cur) await removeProgress(cur.id);
    return;
  }
  if (!cur) {
    // Gone (a reset): one PATCH creates it whole, started time included; a second sets the last update.
    await patchProgress(libraryItemId, {
      ...placeOf(prev),
      progress: prev.progress,
      isFinished: prev.isFinished,
      finishedAt: prev.finishedAt,
      hideFromContinueListening: prev.hideFromContinueListening,
      ...(prev.startedAt !== null && { createdAt: prev.startedAt }),
      ...(prev.ebookLocation !== null && { ebookLocation: prev.ebookLocation }),
      ...(prev.ebookProgress !== null && { ebookProgress: prev.ebookProgress }),
    });
    if (prev.lastUpdate !== null)
      await patchProgress(libraryItemId, { lastUpdate: prev.lastUpdate, markAsFinishedTimeRemaining: 0 });
    return;
  }
  // A finished record can't take a new place without un-finishing, so un-finish it first when the place must move.
  let finished = cur.isFinished;
  if (finished && (!prev.isFinished || cur.currentTime !== prev.currentTime)) {
    await setFinished(libraryItemId, false);
    finished = false;
  }
  if (!finished && !prev.isFinished) return patchProgress(libraryItemId, { ...placeOf(prev), ...finishOf(prev) });
  if (!finished) await patchProgress(libraryItemId, placeOf(prev));
  await patchProgress(libraryItemId, finishOf(prev));
}
