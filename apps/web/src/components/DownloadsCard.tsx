import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import { Dialog, PillButton, RowThumb, SectionCard } from '@joepittsy/ui';
import {
  downloadSpace,
  downloadsSupported,
  fmtBytes,
  percentOf,
  removeDownload,
  useDownloads,
  type DownloadedBook,
} from '../downloads';
import styles from './DownloadsCard.module.css';

/** Where a download stands, in a few words. */
function downloadLine(b: DownloadedBook): string {
  const pct = percentOf(b.bytes, b.totalBytes);
  switch (b.status) {
    case 'complete':
      return `${fmtBytes(b.totalBytes)} · Downloaded`;
    case 'downloading':
      return `${fmtBytes(b.totalBytes)} · Downloading ${pct}%`;
    case 'queued':
      return `${fmtBytes(b.totalBytes)} · Waiting to download`;
    case 'paused':
      return `${fmtBytes(b.totalBytes)} · Paused at ${pct}%`;
    case 'failed':
      return `${fmtBytes(b.totalBytes)} · Couldn't download`;
  }
}

/** Settings' Downloads: each book on the device with its size and state, the space they take and what's free. */
export function DownloadsCard({ className }: { className?: string }) {
  const books = useDownloads();
  const navigate = useNavigate();
  const [free, setFree] = useState<number | null>(null);
  const [removing, setRemoving] = useState<DownloadedBook | null>(null);
  const used = books.reduce((n, b) => n + b.bytes, 0);
  // Asked again whenever the list changes, as a download or removal changes what's free.
  useEffect(() => {
    let live = true;
    void downloadSpace().then((s) => live && setFree(s.free));
    return () => {
      live = false;
    };
  }, [books]);

  if (!downloadsSupported()) return null;
  const summary = [
    books.length > 0 && `${fmtBytes(used)} used by downloads`,
    free !== null && `${fmtBytes(free)} free on this device`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SectionCard title="Downloads" className={className} sub={summary || undefined}>
      {books.length === 0 ? (
        <p className={styles.empty}>
          Books you download play with no connection. Download one from its page while you&rsquo;re online.
        </p>
      ) : (
        <ul className={styles.list}>
          {books.map((b) => {
            const open = () => void navigate(`/book/${encodeURIComponent(b.itemId)}`);
            return (
              <li key={b.itemId} className={styles.row}>
                <RowThumb imageUrl={b.coverUrl} onOpen={open} />
                <button type="button" className={styles.open} onClick={open}>
                  <span className={styles.title}>{b.title}</span>{' '}
                  <span className={styles.detail}>{downloadLine(b)}</span>
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove download of ${b.title}`}
                  title={`Remove download of ${b.title}`}
                  onClick={() => setRemoving(b)}
                >
                  <Trash2 size="1.15em" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {removing && (
        <Dialog
          title="Remove the download?"
          size="sm"
          onClose={() => setRemoving(null)}
          actions={
            <>
              <PillButton onClick={() => setRemoving(null)}>Keep it</PillButton>
              <PillButton
                variant="danger"
                onClick={() => {
                  setRemoving(null);
                  void removeDownload(removing.itemId);
                }}
              >
                Remove
              </PillButton>
            </>
          }
        >
          <p className={styles.dialogText}>
            {removing.title} stays in your library, but it will need a connection to play. This frees{' '}
            {fmtBytes(removing.bytes)}.
          </p>
        </Dialog>
      )}
    </SectionCard>
  );
}
