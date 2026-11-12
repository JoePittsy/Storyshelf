import { useEffect, useRef } from 'react';
import { usePlayer } from './engine';
import { playerAnnouncement, sayAgain, type Heard } from './announce';
import styles from './ModeAnnouncer.module.css';

const heard = (p: Heard): Heard => ({
  status: p.status,
  item: p.item,
  rate: p.rate,
  sleep: p.sleep,
  position: p.position,
  ended: p.ended,
});

/**
 * Tells a screen reader what the player did when the listener acted: play, pause, a new speed, the sleep timer. The
 * region is always mounted, and empty at first, since one that appears with its content is not reliably announced. It
 * reuses the hidden status line's look from ModeAnnouncer. Renders nothing visible.
 */
export function PlayerAnnouncer() {
  const p = usePlayer();
  const line = useRef<HTMLParagraphElement>(null);
  // What was last heard, with the last playing or paused status standing for a status that is passing through loading.
  const prev = useRef<Heard>(heard(p));
  const lastPlayedId = useRef<string | null>(p.status === 'playing' ? (p.item?.id ?? null) : null);
  useEffect(() => {
    const next = heard(p);
    const text = playerAnnouncement(prev.current, next, lastPlayedId.current);
    const settled = next.status === 'playing' || next.status === 'paused';
    prev.current = settled ? next : { ...next, status: prev.current.status };
    if (next.status === 'playing') lastPlayedId.current = next.item?.id ?? null;
    if (text && line.current) {
      line.current.textContent = sayAgain(line.current.textContent, text);
    }
  });
  return <p ref={line} className={styles.sr} role="status" aria-live="polite" />;
}
