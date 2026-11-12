import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar, useBackToClose } from '@joepittsy/ui';
import { restoreSession } from '../api/auth';
import { useSignOut } from './useSignOut';
import styles from './AccountMenu.module.css';

/**
 * The account, behind the user's initial: who is signed in, and Sign out, which asks first because it stops playback.
 * A disclosure rather than an ARIA menu: it holds a line of text and a couple of buttons, so it is a small panel in the tab order.
 */
export function AccountMenu({ onShowShortcuts }: { onShowShortcuts?: () => void }) {
  const { data: user } = useQuery({ queryKey: ['session'], queryFn: restoreSession, staleTime: Infinity });
  const [open, setOpen] = useState(false);
  const { ask, confirming: confirm, busy, dialog } = useSignOut();
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

  // The browser's Back closes the panel instead of leaving the page, and focus goes back to the button, as for Esc.
  useBackToClose(open, () => {
    setOpen(false);
    trigger.current?.focus();
  });

  // The dialog hands focus back to what opened it, which was the Sign out item in a panel that has since closed;
  // when it goes away without signing out, focus belongs on the account button.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirm && !busy) trigger.current?.focus();
    wasConfirming.current = confirm;
  }, [confirm, busy]);

  if (!user) return null;
  const name = user.username;

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
          {onShowShortcuts && (
            <button
              type="button"
              className={styles.item}
              aria-keyshortcuts="?"
              onClick={() => {
                setOpen(false);
                onShowShortcuts();
              }}
            >
              Keyboard shortcuts
            </button>
          )}
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              ask();
            }}
          >
            Sign out
          </button>
        </div>
      )}
      {dialog}
    </div>
  );
}
