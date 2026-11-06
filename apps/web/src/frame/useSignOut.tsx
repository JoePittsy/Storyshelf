import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, PillButton } from '@joepittsy/ui';
import { logout } from '../api/auth';
import { stop } from '../player/engine';

/**
 * The one way to sign out: `ask()` opens the confirmation (it stops playback, so it asks first), and the dialog's
 * button stops the player, signs out and clears the session, which sends the app to /sign-in. Render `dialog` anywhere.
 */
export function useSignOut(): { ask: () => void; confirming: boolean; busy: boolean; dialog: ReactNode } {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = () => {
    setBusy(true);
    void stop()
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
      Playback will stop. Your place in the book is saved, so you can pick it up again after signing in.
    </Dialog>
  );

  return { ask: () => setConfirming(true), confirming, busy, dialog };
}
