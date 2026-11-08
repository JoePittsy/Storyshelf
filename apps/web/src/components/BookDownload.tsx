import { useState } from 'react';
import { Check, Download } from 'lucide-react';
import { Dialog, PillButton, ProgressBar, useToast } from '@joepittsy/ui';
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
} from '../downloads';
import styles from './BookDownload.module.css';

const TOLD_KEY = 'storyshelf.downloads.toldForeground';

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

interface Props {
  itemId: string;
  title: string;
}

/** A book's download, beside its play button: start it, follow it, pause or cancel it, and remove it once it's done. */
export function BookDownload({ itemId, title }: Props) {
  const book = useDownloads().find((b) => b.itemId === itemId);
  const offline = useOffline();
  const allowed = useCanDownload();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!downloadsSupported()) return null;

  const start = async () => {
    setStarting(true);
    setRefused(null);
    const r = await startDownload(itemId);
    setStarting(false);
    if (!r.ok) setRefused(r.reason);
    else tellOnce((m) => showToast(m, 'info', { durationMs: 10_000, replaceKey: 'downloads-foreground' }));
  };
  const cancel = (
    <PillButton aria-label={`Cancel download of ${title}`} onClick={() => void removeDownload(itemId)}>
      Cancel
    </PillButton>
  );

  if (!book) {
    // Offline there is nothing to offer: a download needs the server.
    if (offline) return null;
    return (
      <div className={styles.root}>
        <div className={styles.row}>
          <PillButton disabled={!allowed || starting} onClick={() => void start()}>
            <Download size="1.1em" aria-hidden="true" />
            Download
          </PillButton>
        </div>
        {!allowed && <p className={styles.note}>Downloads are turned off for your account.</p>}
        {refused && (
          <p className={styles.note} role="alert">
            {refused}
          </p>
        )}
      </div>
    );
  }

  const pct = percentOf(book.bytes, book.totalBytes);
  const sizes = `${fmtBytes(book.bytes)} of ${fmtBytes(book.totalBytes)}`;

  if (book.status === 'complete')
    return (
      <div className={styles.root}>
        <div className={styles.row}>
          <p className={styles.state}>
            <Check className={styles.done} size="1.1em" aria-hidden="true" strokeWidth={3} />
            Downloaded · {fmtBytes(book.totalBytes)}
          </p>
          <PillButton aria-label={`Remove download of ${title}`} onClick={() => setConfirming(true)}>
            Remove
          </PillButton>
        </div>
        {confirming && (
          <Dialog
            title="Remove the download?"
            size="sm"
            onClose={() => setConfirming(false)}
            actions={
              <>
                <PillButton onClick={() => setConfirming(false)}>Keep it</PillButton>
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
              {title} stays in your library, but it will need a connection to play. This frees{' '}
              {fmtBytes(book.totalBytes)}.
            </p>
          </Dialog>
        )}
      </div>
    );

  if (book.status === 'downloading' || book.status === 'queued')
    return (
      <div className={styles.root}>
        <p className={styles.state}>
          {book.status === 'queued' ? 'Waiting to download' : `Downloading ${pct}%`}
          <span className={styles.sizes}> · {sizes}</span>
        </p>
        <ProgressBar value={pct / 100} label={`Downloading ${title}`} showEmpty className={styles.bar} />
        <div className={styles.row}>
          <PillButton aria-label={`Pause download of ${title}`} onClick={() => void pauseDownload(itemId)}>
            Pause
          </PillButton>
          {cancel}
        </div>
      </div>
    );

  const failed = book.status === 'failed';
  return (
    <div className={styles.root}>
      <p className={styles.state}>
        {failed ? "Couldn't download" : `Paused at ${pct}%`}
        <span className={styles.sizes}> · {sizes}</span>
      </p>
      <ProgressBar value={pct / 100} label={`Downloading ${title}`} showEmpty className={styles.bar} />
      {book.error && <p className={styles.note}>{book.error}</p>}
      <div className={styles.row}>
        {/* Offline it carries on by itself, or can be resumed once there's a connection. */}
        {!offline && (
          <PillButton
            aria-label={failed ? `Try again: download ${title}` : `Resume download: ${title}`}
            onClick={() => void resumeDownload(itemId)}
          >
            {failed ? 'Try again' : 'Resume download'}
          </PillButton>
        )}
        {cancel}
      </div>
    </div>
  );
}
