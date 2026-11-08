import { useEffect, useRef } from 'react';
import { useToast } from '@joepittsy/ui';
import { usePlayer } from '../player/engine';
import { applyUpdate, useUpdateReady } from '../pwa/updates';

/** How long the offer stays up: long enough to finish a thought, after which Settings still has it. */
const OFFER_MS = 10 * 60_000;

/** Offers a new release once it's ready, with an Update button. Once per release. Renders nothing. */
export function UpdatePrompt() {
  const ready = useUpdateReady();
  const playing = usePlayer().status === 'playing';
  const playingNow = useRef(playing);
  useEffect(() => {
    playingNow.current = playing;
  });
  const { showToast } = useToast();
  useEffect(() => {
    if (!ready) return;
    showToast(
      playingNow.current
        ? 'A new version of Storyshelf is ready. Updating pauses your book.'
        : 'A new version of Storyshelf is ready.',
      'info',
      { action: { label: 'Update', onClick: applyUpdate }, durationMs: OFFER_MS, replaceKey: 'app-update' }
    );
  }, [ready, showToast]);
  return null;
}
