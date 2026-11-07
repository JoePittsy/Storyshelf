import { useSyncExternalStore } from 'react';

/** Whether a media query matches now, and follows it as the window changes. False where `matchMedia` is missing (tests, SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => !!window.matchMedia?.(query).matches,
    () => false
  );
}
