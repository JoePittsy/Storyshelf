import { useEffect } from 'react';
import { useToast } from '@joepittsy/ui';
import { usePlayer } from './engine';

/** Shows playback errors as toasts, with a retry (toggle re-requests the last book). Renders nothing. */
export function PlayerToasts() {
  const { error, toggle } = usePlayer();
  const { showToast } = useToast();
  useEffect(() => {
    if (error) showToast(error, 'error', { action: { label: 'Try again', onClick: toggle }, durationMs: 8000 });
  }, [error, showToast, toggle]);
  return null;
}
