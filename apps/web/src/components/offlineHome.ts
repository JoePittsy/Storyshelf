// The decisions behind the offline home: which download to offer to carry on with, and how each one reads.
import { fmtBytes, type DownloadedBook } from '../downloads';

interface Place {
  currentTime?: number;
  lastUpdate?: number;
  isFinished?: boolean;
}

/**
 * The book to jump back in to: a download that's on the device in full. The one in the player if it is one, else the
 * one last listened to (the server's progress, as last kept here), else the newest. Finished books aren't offered.
 */
export function jumpBackIn(
  downloads: DownloadedBook[],
  progress: Map<string, Place>,
  playerItemId?: string
): DownloadedBook | undefined {
  const ready = downloads.filter((d) => d.status === 'complete' && !progress.get(d.itemId)?.isFinished);
  const inPlayer = ready.find((d) => d.itemId === playerItemId);
  if (inPlayer) return inPlayer;
  const heard = (d: DownloadedBook) => progress.get(d.itemId)?.lastUpdate ?? 0;
  return [...ready].sort((a, b) => heard(b) - heard(a) || b.addedAt - a.addedAt)[0];
}

/** A download's state in a few words: "Downloaded · 312 MB", "Downloading 42%", "Paused: you left the app". */
export function downloadLine(d: DownloadedBook): string {
  const pct = d.totalBytes > 0 ? Math.floor((d.bytes / d.totalBytes) * 100) : 0;
  switch (d.status) {
    case 'complete':
      return `Downloaded · ${fmtBytes(d.totalBytes)}`;
    case 'downloading':
      return `Downloading ${pct}%`;
    case 'queued':
      return 'Waiting to download';
    case 'paused':
      return d.error ? `Paused at ${pct}%: ${d.error}` : `Paused at ${pct}%`;
    case 'failed':
      return d.error ? `Didn't download: ${d.error}` : "Didn't download";
  }
}
