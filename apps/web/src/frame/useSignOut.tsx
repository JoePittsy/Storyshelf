import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, PillButton } from '@joepittsy/ui';
import { logout } from '../api/auth';
import { stop } from '../player/engine';
import { flushListening, forgetListening } from '../player/localSessions';
import { forgetPlaces } from '../player/places';
import { fmtBytes, removeAllDownloads, useDownloads } from '../downloads';

/** How long signing out waits to send listening done offline. */
const FLUSH_MS = 5000;

const within = <T,>(p: Promise<T>, ms: number): Promise<T | void> =>
  Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

/**
 * The one way to sign out: `ask()` opens the confirmation (it stops playback, so it asks first), and the dialog's
 * button stops the player, signs out and clears the session, which sends the app to /sign-in. Render `dialog` anywhere.
 */
export function useSignOut(): { ask: () => void; confirming: boolean; busy: boolean; dialog: ReactNode } {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const downloads = useDownloads();
  const bytes = downloads.reduce((n, d) => n + d.bytes, 0);

  const signOut = () => {
    setBusy(true);
    void stop()
      // Listening done offline and not yet sent gets a last try (briefly: signing out mustn't hang on a bad connection).
      .then(() => within(flushListening(), FLUSH_MS).catch(() => undefined))
      // The device keeps nothing of the listener's once they sign out: downloads, places and unsent listening. Before
      // logout, which forgets who they were.
      .then(removeAllDownloads)
      .then(() => {
        forgetListening();
        forgetPlaces();
      })
      .then(logout)
      .then(() => qc.setQueryData(['session'], null));
  };

  const dialog = confirming && (
    <Dialog
      title="Sign out of Storyshelf?"
      size="sm"
      onClose={() => !busy && setConfirming(false)}
      actions={
        <>
          <PillButton data-autofocus disabled={busy} onClick={() => setConfirming(false)}>
            Stay signed in
          </PillButton>
          <PillButton variant="danger" disabled={busy} onClick={signOut}>
            Sign out
          </PillButton>
        </>
      }
    >
      {downloads.length > 0
        ? `Playback will stop, and ${downloads.length === 1 ? 'the book' : `the ${downloads.length} books`} downloaded to this device (${fmtBytes(bytes)}) will be removed. Your place is saved, so you can pick it up again after signing in.`
        : 'Playback will stop. Your place in the book is saved, so you can pick it up again after signing in.'}
    </Dialog>
  );

  return { ask: () => setConfirming(true), confirming, busy, dialog };
}
