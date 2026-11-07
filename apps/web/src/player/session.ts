import { AbsError, absFetch } from '../api/auth';
import { absUrl } from '../api/server';
import { cleanChapters, type Chapter } from './chapters';
import type { AudioTrack } from './timeline';

export interface PlaybackSession {
  id: string;
  libraryItemId: string;
  currentTime: number;
  duration: number;
  playMethod: number;
  audioTracks: AudioTrack[];
  chapters: Chapter[];
  displayTitle: string;
  displayAuthor: string;
}

export class UnsupportedFormatError extends Error {
  constructor() {
    super('Unsupported audio format');
    this.name = 'UnsupportedFormatError';
  }
}

export interface Progress {
  currentTime: number;
  timeListened: number;
  duration: number;
}

const DEVICE_KEY = 'storyshelf.deviceId';
let memoryDeviceId: string | null = null;

/** This browser's device id, sent with every session it opens (ABS keeps it in the session's `deviceInfo`). */
export function ourDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return (memoryDeviceId = stored);
  } catch {
    // Storage unavailable: fall through to an in-memory id.
  }
  memoryDeviceId = crypto.randomUUID();
  try {
    localStorage.setItem(DEVICE_KEY, memoryDeviceId);
  } catch {
    // Not persisted; the in-memory id still serves this page.
  }
  return memoryDeviceId;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** POST /api/items/:id/play. playMethod !== 0 (not direct play) → UnsupportedFormatError, after closing that session. */
export async function openSession(libraryItemId: string, supportedMimeTypes: string[]): Promise<PlaybackSession> {
  const s = await absFetch<PlaybackSession>(
    `/api/items/${libraryItemId}/play`,
    json({
      deviceInfo: { deviceId: ourDeviceId(), clientName: 'Storyshelf' },
      supportedMimeTypes,
      mediaPlayer: 'html5',
      forceDirectPlay: false,
    })
  );
  if (s.playMethod !== 0) {
    await closeSession(s);
    throw new UnsupportedFormatError();
  }
  return { ...s, chapters: cleanChapters(s.chapters) };
}

/** POST /api/session/:id/sync. Only a 404 (server restarted) re-opens the session, once; resolves with the session now active. */
export async function syncSession(
  s: PlaybackSession,
  p: Progress,
  supportedMimeTypes: string[]
): Promise<PlaybackSession> {
  const send = (id: string) => absFetch<void>(`/api/session/${id}/sync`, { ...json(p), keepalive: true });
  try {
    await send(s.id);
    return s;
  } catch (e) {
    if (!(e instanceof AbsError && e.status === 404)) throw e;
  }
  const fresh = await openSession(s.libraryItemId, supportedMimeTypes);
  await send(fresh.id);
  return fresh;
}

/**
 * PATCH /api/me/progress/:id: records a place with no playback session (ABS 2.37: `currentTime`, `duration`, `progress`;
 * the server stamps `lastUpdate` itself). For a move made on a restored book before it has been played.
 */
export function saveProgress(libraryItemId: string, currentTime: number, duration: number): Promise<void> {
  return patchProgress(libraryItemId, {
    currentTime,
    duration,
    progress: duration > 0 ? Math.min(1, currentTime / duration) : 0,
  });
}

/** What PATCH /api/me/progress/:id takes (ABS 2.37 MediaProgress.applyProgressUpdate; `createdAt` only when it creates). */
export interface ProgressPatch {
  currentTime?: number;
  duration?: number;
  progress?: number;
  isFinished?: boolean;
  /** ms since the epoch. Applied when the update finishes the book, or as it stands on an already finished one. */
  finishedAt?: number | null;
  hideFromContinueListening?: boolean;
  ebookLocation?: string | null;
  ebookProgress?: number | null;
  /** ms since the epoch: ABS stamps it as the record's `updatedAt` (`lastUpdate`) after saving. */
  lastUpdate?: number;
  /** ms since the epoch: the record's `startedAt`, honoured only when this PATCH creates the record. */
  createdAt?: number;
  /** Seconds left under which ABS finishes the book by itself (default 10); 0 turns that off for this update. */
  markAsFinishedTimeRemaining?: number;
}

/** PATCH /api/me/progress/:libraryItemId: creates the book's progress or updates it, with no playback session. */
export function patchProgress(libraryItemId: string, body: ProgressPatch): Promise<void> {
  return absFetch<void>(`/api/me/progress/${libraryItemId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

/** POST /api/session/:id/close with keepalive: true. Never rejects (best effort). */
export async function closeSession(s: PlaybackSession, p?: Progress): Promise<void> {
  try {
    await absFetch<void>(`/api/session/${s.id}/close`, { ...json(p ?? {}), keepalive: true });
  } catch {
    // Best effort.
  }
}

export function trackUrl(s: PlaybackSession, index: number): string {
  return absUrl(`/public/session/${s.id}/track/${index}`);
}
