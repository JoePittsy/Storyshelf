// The player's view of downloads: a book's files kept on the device, as object URLs the <audio> element can play.
import { downloadOf, downloadedItem, isDownloaded, localTrackUrls, onDownloadsChange } from '../downloads';
import type { DownloadedItem } from '../downloads';

export interface LocalBook {
  item: DownloadedItem;
  /** Object URLs by track index (ABS's `index`, as the session's audio tracks have it). */
  urls: Map<number, string>;
  /** An object URL of the saved cover, or null. */
  cover: string | null;
}

/** The whole book is on the device. */
export const onDevice = (itemId: string): boolean => isDownloaded(itemId);

/** The book's saved details and its files' object URLs, or null when it isn't on the device in full. */
export async function localBook(itemId: string): Promise<LocalBook | null> {
  const [item, urls] = await Promise.all([downloadedItem(itemId), localTrackUrls(itemId)]);
  if (!item || !urls?.length || urls.length !== item.tracks.length) return null;
  return {
    item,
    urls: new Map(item.tracks.map((t, i) => [t.index, urls[i]])),
    cover: downloadOf(itemId)?.coverUrl ?? null,
  };
}

/** An object URL of the cover saved with the book, or null. */
export const coverOnDevice = (itemId: string): string | null => downloadOf(itemId)?.coverUrl ?? null;

/** Calls back when the downloads change. Returns the unsubscribe. */
export const onDownloadsChanged = (cb: () => void): (() => void) => onDownloadsChange(cb);
