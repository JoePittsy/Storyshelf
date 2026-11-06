import { AbsError, absFetch } from '../api/auth';
import type { Chapter } from './chapters';
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

function deviceId(): string {
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
      deviceInfo: { deviceId: deviceId(), clientName: 'Storyshelf' },
      supportedMimeTypes,
      mediaPlayer: 'html5',
      forceDirectPlay: false,
    }),
  );
  if (s.playMethod !== 0) {
    await closeSession(s);
    throw new UnsupportedFormatError();
  }
  return s;
}

/** POST /api/session/:id/sync. Only a 404 (server restarted) re-opens the session, once; resolves with the session now active. */
export async function syncSession(
  s: PlaybackSession,
  p: Progress,
  supportedMimeTypes: string[],
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

/** POST /api/session/:id/close with keepalive: true. Never rejects (best effort). */
export async function closeSession(s: PlaybackSession, p?: Progress): Promise<void> {
  try {
    await absFetch<void>(`/api/session/${s.id}/close`, { ...json(p ?? {}), keepalive: true });
  } catch {
    // Best effort.
  }
}

export function trackUrl(s: PlaybackSession, index: number): string {
  return `/public/session/${s.id}/track/${index}`;
}
