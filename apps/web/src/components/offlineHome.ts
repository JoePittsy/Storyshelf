// The decisions behind the offline home: which download to offer to carry on with, and how each one reads.
import type { DownloadedBook } from '../downloads';

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

/**
 * The server's progress as last kept here, with this device's own place on top where it is newer (listening done
 * offline that the server hasn't heard of yet). `placeOf` is places.ts's.
 */
export function withPlacesHere<P extends Place>(
  progress: Map<string, P>,
  downloads: DownloadedBook[],
  placeOf: (itemId: string) => { position: number; updatedAt: number } | undefined
): Map<string, Place> {
  const out = new Map<string, Place>(progress);
  for (const d of downloads) {
    const here = placeOf(d.itemId);
    const p = progress.get(d.itemId);
    if (here && here.updatedAt > (p?.lastUpdate ?? 0))
      out.set(d.itemId, { ...p, currentTime: here.position, lastUpdate: here.updatedAt });
  }
  return out;
}

/** Bytes as the listener reads them: "312 MB", "1.4 GB". */
export function fmtSize(bytes: number): string {
  if (!(bytes > 0)) return '0 MB';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

/** A download's state in a few words: "Downloaded · 312 MB", "Downloading 42%", "Paused: you left the app". */
export function downloadLine(d: DownloadedBook): string {
  const pct = d.totalBytes > 0 ? Math.floor((d.bytes / d.totalBytes) * 100) : 0;
  switch (d.status) {
    case 'complete':
      return `Downloaded · ${fmtSize(d.totalBytes)}`;
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
