import { useEffect } from 'react';
import { useToast } from '@joepittsy/ui';
import { fmtClock } from '../screens/bookHelpers';
import { checkHandoff, onHandoffNotice, seek } from './engine';
import { writerPlace, writerSubject } from './handoff';
import { usePlayerJump } from './useUndoableJump';

/**
 * How often the player asks the server for the loaded book's place while the page is visible: a GET of one small
 * record. Often enough that a tab left open on a desk shows the offer before anyone reaches for Play (Play checks
 * anyway), rare enough to cost nothing. A hidden page doesn't ask; it asks as it comes back.
 */
export const CHECK_EVERY_MS = 60_000;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Keeps the player's place honest across devices (see engine `checkHandoff`): asks when the page wakes or gets focus,
 * and every minute while it is visible. Says what the player did by itself: took a newer place on Play (with Undo), or
 * carried on over another device that was playing too (with a way there). Renders nothing.
 */
export function HandoffWatch() {
  const { showToast } = useToast();
  const { jumpTo } = usePlayerJump();

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible';
    const wake = () => void (visible() && checkHandoff('wake'));
    const tick = () => void (visible() && checkHandoff('tick'));
    document.addEventListener('visibilitychange', wake);
    addEventListener('focus', wake);
    const timer = setInterval(tick, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      removeEventListener('focus', wake);
      clearInterval(timer);
    };
  }, []);

  useEffect(
    () =>
      onHandoffNotice((n) => {
        const who = writerSubject(n.device);
        if (n.kind === 'adopted')
          return showToast(`Picked up where ${lower(who)} left off, ${fmtClock(n.to, false)}`, 'info', {
            action: { label: 'Undo', shortcutKey: 'u', onClick: () => seek(n.from) },
            durationMs: 12000,
            replaceKey: 'chapter-jump',
          });
        showToast(`${who} was also playing, at ${fmtClock(n.at, false)}. Carrying on here.`, 'info', {
          action: { label: 'Jump there', onClick: () => jumpTo(n.at, writerPlace(n.device)) },
          durationMs: 12000,
          replaceKey: 'handoff-conflict',
        });
      }),
    [showToast, jumpTo]
  );
  return null;
}
