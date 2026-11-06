import { useEffect } from 'react';
import { useDominantColor } from '@joepittsy/ui';

/**
 * The dominant colour of a cover, handed to the frame (Frame.module.css), which washes the page ground with it for as
 * long as the page is mounted. Returns the colour too, for the page's own HeroBand wash. null until it is known.
 */
export function usePanelColor(cover: string | null): string | null {
  const wash = useDominantColor(cover);
  useEffect(() => {
    if (!wash) return;
    const root = document.documentElement.style;
    root.setProperty('--panel-color', wash);
    root.setProperty('--panel-on', '1');
    return () => {
      root.removeProperty('--panel-color');
      root.removeProperty('--panel-on');
    };
  }, [wash]);
  return wash;
}
