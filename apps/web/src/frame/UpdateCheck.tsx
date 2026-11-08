import { useState } from 'react';
import { PillButton } from '@joepittsy/ui';
import { applyUpdate, checkForUpdate, useUpdateReady, type CheckResult } from '../pwa/updates';
import styles from './UpdateCheck.module.css';

const SAID: Record<Exclude<CheckResult, 'ready'>, string> = {
  current: 'You’re up to date.',
  failed: 'Couldn’t check. Try again when you’re online.',
  unsupported: 'This browser updates Storyshelf by itself when you reload.',
};

/** Settings > About: ask for a new release now, and move to it. */
export function UpdateCheck() {
  const ready = useUpdateReady();
  const [checking, setChecking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  if (ready)
    return (
      <span className={styles.row}>
        <span>A new version is ready.</span>
        <PillButton variant="primary" onClick={applyUpdate}>
          Update
        </PillButton>
      </span>
    );
  return (
    <span className={styles.row}>
      <PillButton
        disabled={checking}
        aria-busy={checking || undefined}
        onClick={() => {
          setChecking(true);
          setSaid(null);
          void checkForUpdate().then((r) => {
            setChecking(false);
            if (r !== 'ready') setSaid(SAID[r]);
          });
        }}
      >
        {checking ? 'Checking…' : 'Check for updates'}
      </PillButton>
      <span role="status" className={styles.note}>
        {said}
      </span>
    </span>
  );
}
