import { useState } from 'react';
import { Share, SquarePlus } from 'lucide-react';
import { Dialog, PillButton, SectionCard } from '@joepittsy/ui';
import { offersInstall, useInstall } from './install';
import styles from './InstallCard.module.css';

/**
 * Settings' App card: installs Storyshelf where the browser can (Chromium's own dialog), walks an iPhone through
 * Share then Add to Home Screen, and points Mac Safari at its menu. Nothing when installed or not installable.
 */
export function InstallCard({ className }: { className?: string }) {
  const { route, promptInstall } = useInstall();
  const [steps, setSteps] = useState(false);
  if (!offersInstall(route)) return null;

  return (
    <SectionCard title="App" className={className}>
      {route === 'prompt' && (
        <div className={styles.row}>
          <p className={styles.text}>Install Storyshelf for its own window and icon, without the browser's bars.</p>
          <PillButton onClick={() => void promptInstall()}>Install Storyshelf</PillButton>
        </div>
      )}
      {route === 'ios' && (
        <div className={styles.row}>
          <p className={styles.text}>
            Add Storyshelf to your Home Screen for its own icon and a full-screen player, without the browser's bars.
          </p>
          <PillButton onClick={() => setSteps(true)}>Add to Home Screen</PillButton>
        </div>
      )}
      {route === 'mac-safari' && (
        <p className={styles.text}>
          In Safari, choose <strong>File › Add to Dock</strong> to keep Storyshelf in its own window.
        </p>
      )}
      {steps && (
        <Dialog
          title="Add to Home Screen"
          size="sm"
          onClose={() => setSteps(false)}
          actions={
            <PillButton variant="primary" data-autofocus onClick={() => setSteps(false)}>
              Done
            </PillButton>
          }
        >
          <ol className={styles.steps}>
            <li>
              Tap <Share className={styles.glyph} aria-hidden /> <strong>Share</strong> in the browser's toolbar.
            </li>
            <li>
              Scroll down and tap <SquarePlus className={styles.glyph} aria-hidden />{' '}
              <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>.
            </li>
          </ol>
          <p className={styles.after}>
            Open Storyshelf from its new icon. You'll sign in once more there: the Home Screen app keeps its own
            storage, apart from the browser's.
          </p>
        </Dialog>
      )}
    </SectionCard>
  );
}
