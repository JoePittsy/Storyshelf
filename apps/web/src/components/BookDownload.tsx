import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { ArrowDown, Check, Download, Pause, RotateCw } from 'lucide-react';
import { Dialog, PillButton, useToast } from '@joepittsy/ui';
import { useOffline } from '../api/connectivity';
import {
  downloadsSupported,
  fmtBytes,
  pauseDownload,
  percentOf,
  removeDownload,
  resumeDownload,
  startDownload,
  useCanDownload,
  useDownloads,
  type DownloadedBook,
} from '../downloads';
import styles from './BookDownload.module.css';

const TOLD_KEY = 'storyshelf.downloads.toldForeground';
/** How long a press is held before it opens the options instead of acting. */
export const HOLD_MS = 500;

/** Says once, on the first download, that iOS stops a download when the app leaves the screen. */
function tellOnce(show: (message: string) => void): void {
  try {
    if (localStorage.getItem(TOLD_KEY)) return;
    localStorage.setItem(TOLD_KEY, '1');
  } catch {
    // Storage blocked: say it each time rather than never.
  }
  show('Downloads pause if you leave the app. Keep Storyshelf open until the book is downloaded.');
}

/** Whether the book page should give the download a place: there's something to show or to start. */
export function useHasBookDownload(itemId: string): boolean {
  const book = useDownloads().find((b) => b.itemId === itemId);
  const offline = useOffline();
  return downloadsSupported() && (!!book || !offline);
}

interface Props {
  itemId: string;
  title: string;
  /** No fill until hovered, as the player's own round buttons (car mode, AirPlay). Default: the tonal circle. */
  quiet?: boolean;
}

/**
 * A book's download as one round button, top right of its hero. Not downloaded: a download icon; tap to start.
 * Downloading: a ring that fills; tap to pause, hold (or right-click) for Cancel. Paused or failed: the ring where it
 * stopped; tap to carry on, hold for Cancel. Downloaded: the download icon with a tick; tap for Remove, which asks first.
 * Hold is a shortcut, never the only way: the options also open from the keyboard's context-menu key or Shift+F10.
 */
export function BookDownload({ itemId, title, quiet = false }: Props) {
  const book = useDownloads().find((b) => b.itemId === itemId);
  const offline = useOffline();
  const allowed = useCanDownload();
  const { showToast } = useToast();
  const menuId = useId();
  const hintId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);

  const say = (m: string) => showToast(m, 'info', { replaceKey: 'book-download' });
  /** Opens the options. From the keyboard, focus goes to the first; a tap or hold leaves it where it is. */
  const openMenu = (fromKeyboard = false) => {
    if (!book) return;
    menu.current?.showPopover?.();
    if (fromKeyboard) menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };
  const closeMenu = () => menu.current?.hidePopover?.();

  const start = async () => {
    if (!allowed) return say('Downloads are turned off for your account.');
    setStarting(true);
    const r = await startDownload(itemId);
    setStarting(false);
    if (!r.ok) return say(r.reason);
    tellOnce((m) => showToast(m, 'info', { durationMs: 10_000, replaceKey: 'downloads-foreground' }));
  };

  const tap = (fromKeyboard: boolean) => {
    if (!book) return void start();
    if (book.status === 'complete') return openMenu(fromKeyboard);
    if (book.status === 'downloading' || book.status === 'queued') return void pauseDownload(itemId);
    if (offline) return say('It carries on by itself when you’re back online.');
    void resumeDownload(itemId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      openMenu(true);
    }
  };

  const press = usePress(tap, () => openMenu());

  if (!downloadsSupported()) return null;
  // Offline there's nothing to start: a download needs the server.
  if (!book && offline) return null;

  const view = describe(book, title, offline);
  const pct = book ? percentOf(book.bytes, book.totalBytes) : 0;
  const ring = !!book && book.status !== 'complete';

  return (
    <span className={styles.root}>
      <button
        ref={button}
        type="button"
        className={`${styles.button}${quiet ? ' ' + styles.quiet : ''}`}
        aria-label={view.label}
        aria-describedby={book ? hintId : undefined}
        aria-haspopup={book?.status === 'complete' ? 'true' : undefined}
        aria-controls={book ? menuId : undefined}
        aria-busy={starting || undefined}
        disabled={starting}
        onKeyDown={onKeyDown}
        {...press}
      >
        {ring && <Ring fraction={pct / 100} />}
        <Glyph book={book} />
      </button>
      {book && (
        <>
          <span id={hintId} className={styles.srOnly}>
            {view.hint}
          </span>
          <div id={menuId} ref={menu} popover="auto" className={styles.pop} role="group" aria-label={view.menuLabel}>
            <p className={styles.state}>{view.state}</p>
            {book.error && book.status !== 'complete' && <p className={styles.reason}>{book.error}</p>}
            <button
              type="button"
              className={`${styles.item} ${styles.danger}`}
              onClick={() => {
                closeMenu();
                if (book.status === 'complete') setConfirming(true);
                else void removeDownload(itemId);
              }}
            >
              {book.status === 'complete' ? 'Remove download' : 'Cancel download'}
            </button>
          </div>
        </>
      )}
      {confirming && book && (
        <Dialog
          title="Remove the download?"
          size="sm"
          onClose={() => {
            setConfirming(false);
            button.current?.focus();
          }}
          actions={
            <>
              <PillButton data-autofocus onClick={() => setConfirming(false)}>
                Keep it
              </PillButton>
              <PillButton
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  void removeDownload(itemId);
                }}
              >
                Remove
              </PillButton>
            </>
          }
        >
          <p className={styles.dialogText}>
            {title} stays in your library, but it will need a connection to play. This frees {fmtBytes(book.totalBytes)}
            .
          </p>
        </Dialog>
      )}
    </span>
  );
}

/** What the button says it does, the hint for the hold, and the options' heading, for each state. */
export function describe(book: DownloadedBook | undefined, title: string, offline: boolean) {
  if (!book) return { label: `Download ${title}`, hint: '', menuLabel: '', state: '' };
  const pct = percentOf(book.bytes, book.totalBytes);
  const sizes = `${fmtBytes(book.bytes)} of ${fmtBytes(book.totalBytes)}`;
  const hold = 'Press and hold, or right-click, to cancel.';
  const menuLabel = `Download of ${title}`;
  switch (book.status) {
    case 'complete':
      return {
        label: `Downloaded: ${title}. Download options`,
        hint: '',
        menuLabel,
        state: `Downloaded · ${fmtBytes(book.totalBytes)}`,
      };
    case 'queued':
      return {
        label: `Pause download of ${title}, waiting to start`,
        hint: hold,
        menuLabel,
        state: 'Waiting to download',
      };
    case 'downloading':
      return {
        label: `Pause download of ${title}, ${pct}%`,
        hint: hold,
        menuLabel,
        state: `Downloading ${pct}% · ${sizes}`,
      };
    case 'paused':
      return {
        label: offline ? `Download of ${title} paused at ${pct}%` : `Resume download of ${title}, paused at ${pct}%`,
        hint: [book.error, hold].filter(Boolean).join(' '),
        menuLabel,
        state: `Paused at ${pct}% · ${sizes}`,
      };
    case 'failed':
      return {
        label: `Try downloading ${title} again`,
        hint: [book.error, hold].filter(Boolean).join(' '),
        menuLabel,
        state: "Couldn't download",
      };
  }
}

/** The icon at the button's centre. */
function Glyph({ book }: { book: DownloadedBook | undefined }) {
  const size = '1.15em';
  if (!book) return <Download className={styles.glyph} size={size} aria-hidden="true" />;
  switch (book.status) {
    case 'complete':
      return (
        <span className={styles.done} aria-hidden="true">
          <Download className={styles.glyph} size="1.2em" />
          <span className={styles.tick}>
            <Check size="0.62em" strokeWidth={4} />
          </span>
        </span>
      );
    case 'downloading':
    case 'queued':
      return <Pause className={styles.glyph} size="0.85em" fill="currentColor" strokeWidth={0} aria-hidden="true" />;
    case 'paused':
      return <ArrowDown className={styles.glyph} size="0.95em" strokeWidth={2.5} aria-hidden="true" />;
    case 'failed':
      return <RotateCw className={styles.glyph} size="0.9em" strokeWidth={2.5} aria-hidden="true" />;
  }
}

const R = 19;
const C = 2 * Math.PI * R;

/** The download's progress, round the edge of the button. */
function Ring({ fraction }: { fraction: number }) {
  return (
    <svg className={styles.ring} viewBox="0 0 44 44" aria-hidden="true">
      <circle className={styles.track} cx="22" cy="22" r={R} />
      <circle
        className={styles.fill}
        cx="22"
        cy="22"
        r={R}
        strokeDasharray={C}
        strokeDashoffset={C * (1 - Math.min(1, Math.max(0, fraction)))}
      />
    </svg>
  );
}

/**
 * Tap or hold. A press held for HOLD_MS calls `onHold` (and the click that follows does nothing); a shorter one taps.
 * A right-click opens the options too. Moving off the button cancels the hold. The handlers read the latest callbacks.
 */
function usePress(onTap: (fromKeyboard: boolean) => void, onHold: () => void) {
  const latest = useRef({ onTap, onHold });
  useEffect(() => {
    latest.current = { onTap, onHold };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  // Held long enough: the button says so before the release opens the options.
  const [holding, setHolding] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => clearTimeout(timer.current);
  return {
    'data-holding': holding || undefined,
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      held.current = false;
      cancel();
      timer.current = setTimeout(() => {
        held.current = true;
        setHolding(true);
      }, HOLD_MS);
    },
    // The options open as the press lets go, not while it's held: a popover opened under a pressed finger is closed
    // again by the release (the browser takes it for a press outside it). After the release's own handling, so it stays.
    onPointerUp: () => {
      cancel();
      setHolding(false);
      if (held.current) setTimeout(() => latest.current.onHold(), 0);
    },
    onPointerLeave: () => {
      cancel();
      setHolding(false);
    },
    onPointerCancel: () => {
      cancel();
      setHolding(false);
    },
    // A right-click, or a long press where the system reports one: no click follows it, so nothing to swallow.
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (held.current) return; // the hold already opened them
      cancel();
      latest.current.onHold();
    },
    // A click with no pointer behind it (detail 0) came from Enter or Space.
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      if (held.current) {
        held.current = false;
        return;
      }
      latest.current.onTap(e.detail === 0);
    },
  };
}
