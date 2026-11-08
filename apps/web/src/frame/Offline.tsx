import { CloudOff } from 'lucide-react';
import { EmptyState, PillButton } from '@joepittsy/ui';
import { checkConnection, useOffline } from '../api/connectivity';
import styles from './Offline.module.css';

/** A quiet tonal chip while the app is offline. Renders nothing online. */
export function OfflineBadge({ className }: { className?: string }) {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <span className={[styles.badge, className].filter(Boolean).join(' ')} title="Can't reach your server">
      <CloudOff aria-hidden="true" size="1.1em" strokeWidth={2} />
      Offline
    </span>
  );
}

/** In place of a page that has nothing kept on the device to show while offline. */
export function NeedsConnection() {
  return (
    <main>
      <EmptyState icon={CloudOff} title="You're offline" action={<TryAgain />}>
        This page needs a connection.
      </EmptyState>
    </main>
  );
}

/**
 * The app opened offline with no signed-in user kept on this device (signed in before it kept one, or storage is
 * blocked), so it has nothing to show. It opens by itself once the server answers.
 */
export function OfflineLaunch() {
  return (
    <main className={styles.launch}>
      <EmptyState icon={CloudOff} title="You're offline" action={<TryAgain />}>
        Storyshelf needs a connection to open. It will carry on by itself once you're back online.
      </EmptyState>
    </main>
  );
}

function TryAgain() {
  return (
    <PillButton variant="primary" onClick={() => void checkConnection()}>
      Try again
    </PillButton>
  );
}

/** Announces going offline and coming back, for anyone who can't see the badge. Always rendered. */
export function OfflineAnnouncer() {
  const offline = useOffline();
  return (
    <p className={styles.announce} role="status">
      {offline ? "You're offline" : ''}
    </p>
  );
}
