import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, PillButton, UserAvatar } from '@joepittsy/ui';
import { logout, restoreSession } from '../api/auth';
import { stop } from '../player/engine';
import styles from './AccountMenu.module.css';

/**
 * The account, behind the user's initial: who is signed in, and Sign out, which asks first because it stops playback.
 * A disclosure rather than an ARIA menu: it holds a line of text and one button, so it is a small panel in the tab order.
 */
export function AccountMenu() {
  const qc = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['session'], queryFn: restoreSession, staleTime: Infinity });
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The dialog hands focus back to what opened it, which was the Sign out item in a panel that has since closed;
  // when it goes away without signing out, focus belongs on the account button.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirm && !busy) trigger.current?.focus();
    wasConfirming.current = confirm;
  }, [confirm, busy]);

  if (!user) return null;
  const name = user.username;

  const signOut = () => {
    setBusy(true);
    void stop()
      .then(logout)
      .then(() => qc.setQueryData(['session'], null));
  };

  return (
    <div className={styles.root} ref={root}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Account: ${name}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      >
        <UserAvatar name={name} className={styles.avatar} />
      </button>
      {open && (
        <div id={panelId} className={styles.panel} role="group" aria-label="Account">
          <p className={styles.who}>
            Signed in as <strong>{name}</strong>
          </p>
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              setConfirm(true);
            }}
          >
            Sign out
          </button>
        </div>
      )}
      {confirm && (
        <Dialog
          title="Sign out of Storyshelf?"
          size="sm"
          onClose={() => !busy && setConfirm(false)}
          actions={
            <>
              <PillButton data-autofocus disabled={busy} onClick={() => setConfirm(false)}>
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
      )}
    </div>
  );
}
