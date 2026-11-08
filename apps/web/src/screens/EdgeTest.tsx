import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, Download } from 'lucide-react';
import { PillButton } from '@joepittsy/ui';
import styles from './EdgeTest.module.css';

const STEP = 10;
const ROWS = 24;
// Lines every 10px, labels every 20px (a label is taller than 10px), and sample icons every 30px.

/**
 * Measures how far down from the top of the screen iOS softens what's drawn (its edge effect under the status bar),
 * which blurs the tab row and the player's header in the installed app. Full screen, over the app: a fine line, a
 * label and a sample icon every 10px from the very top. Screenshot it on the phone; the rows that look soft are inside
 * the effect. Reached from the player log page.
 */
export function EdgeTest() {
  const navigate = useNavigate();
  const probe = useRef<HTMLDivElement>(null);
  const [safeTop, setSafeTop] = useState<number | null>(null);
  useEffect(() => {
    if (probe.current) setSafeTop(probe.current.getBoundingClientRect().height);
  }, []);
  return (
    <div className={styles.page}>
      <div ref={probe} className={styles.probe} aria-hidden="true" />
      {Array.from({ length: ROWS }, (_, i) => (
        <div key={i} className={styles.row} style={{ top: i * STEP }}>
          <span className={styles.line} />
          <span className={styles.label}>{i % 2 === 0 ? `${i * STEP}px` : ''}</span>
          {i % 3 === 0 && (
            <>
              <ChevronDown size={16} aria-hidden="true" />
              <Download size={16} aria-hidden="true" />
              <span className={styles.pill} />
            </>
          )}
        </div>
      ))}
      <div className={styles.foot}>
        <p>Status bar (safe area top): {safeTop === null ? '…' : `${Math.round(safeTop)}px`}</p>
        <p>Screenshot this, then go back. The rows that look soft are inside iOS&apos;s blur.</p>
        <PillButton variant="primary" onClick={() => void navigate(-1)}>
          Back
        </PillButton>
      </div>
    </div>
  );
}
