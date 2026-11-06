// Lock-screen and headphone controls. All times are book seconds, the same clock the engine reports.
import type { PlayerItem } from './engine';

export interface MediaActions {
  play: () => void;
  pause: () => void;
  skipBack: () => void;
  skipForward: () => void;
  previous: () => void;
  next: () => void;
  seekTo: (t: number) => void;
}

const ms = (): MediaSession | null => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null);

export function installHandlers(a: MediaActions): void {
  const m = ms();
  if (!m) return;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', a.play],
    ['pause', a.pause],
    ['seekbackward', a.skipBack],
    ['seekforward', a.skipForward],
    ['previoustrack', a.previous],
    ['nexttrack', a.next],
    ['seekto', (d) => d.seekTime != null && a.seekTo(d.seekTime)],
  ];
  for (const [action, h] of handlers) {
    try {
      m.setActionHandler(action, h);
    } catch {
      // A browser that doesn't know this action: skip it.
    }
  }
}

export function updateMetadata(item: PlayerItem | null, chapterTitle: string): void {
  const m = ms();
  if (!m) return;
  m.metadata = item
    ? new MediaMetadata({
        title: item.title,
        artist: item.author,
        album: chapterTitle,
        artwork: [{ src: new URL(item.coverUrl, location.href).href, sizes: '512x512', type: 'image/jpeg' }],
      })
    : null;
}

export function updatePlaybackState(state: 'playing' | 'paused' | 'none'): void {
  const m = ms();
  if (m) m.playbackState = state;
}

/** Never passes NaN, or a position beyond the duration, to the browser (it throws). */
export function updatePositionState(position: number, duration: number, playbackRate: number): void {
  const m = ms();
  if (!m || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position) || !(playbackRate > 0)) return;
  try {
    m.setPositionState({ duration, position: Math.min(Math.max(position, 0), duration), playbackRate });
  } catch {
    // Unsupported or a transient bad state: the lock screen just won't show a scrubber.
  }
}
