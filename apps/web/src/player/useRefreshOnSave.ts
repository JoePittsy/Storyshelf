import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { progressChanged } from '../api/libraries';
import { onProgressSaved } from './engine';

/** Query keys that show progress or listening history; stale once a stop has been saved. */
export const PROGRESS_KEYS = [
  ['item'],
  ['me'],
  ['listening-sessions'],
  ['item-sessions'],
  ['listening-stats'],
  ['items-in-progress'],
  ['personalized'],
] as const;

/** Refetches what shows listening progress when playback pauses or a session closes (not on every periodic sync). */
export function useRefreshOnSave(): void {
  const qc = useQueryClient();
  useEffect(
    () =>
      onProgressSaved(() => {
        progressChanged(); // a stop can finish a book: the Finished list and progress filters must not come from ABS's cache
        PROGRESS_KEYS.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));
      }),
    [qc]
  );
}
