import { useEffect, useRef } from 'react';
import type { ToggleEvent as ReactToggleEvent } from 'react';
import { registerOverlay } from '../lib/backStack';

/**
 * Lets the browser's Back button (and the Android back gesture, and a swipe back) close an overlay instead of leaving
 * the page. While `open`, the overlay owns one history entry (same URL, nothing a router can see); Back pops it and calls
 * `onClose`. Closing any other way removes the entry, so history is left as it was. Inert without the History API.
 * See lib/backStack.ts for how it keeps clear of a router.
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    return registerOverlay(() => latest.current());
  }, [open]);
}

/**
 * The same for a native popover, which opens and closes by itself (`popovertarget`, light dismiss, Esc): spread the
 * result on the `popover` element and it follows its `toggle` events. Back hides the popover, so focus returns to its
 * trigger as for any other close.
 */
export function usePopoverBackToClose(): { onToggle: (e: ReactToggleEvent<HTMLElement>) => void } {
  const release = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    []
  );
  return {
    onToggle: (e) => {
      const el = e.currentTarget;
      if (e.newState === 'open') {
        release.current?.();
        release.current = registerOverlay(() => el.hidePopover?.());
      } else {
        release.current?.();
        release.current = null;
      }
    },
  };
}
