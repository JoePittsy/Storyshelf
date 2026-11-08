import { useEffect } from 'react';
import { useToast } from '@joepittsy/ui';
import { MSG_OFFLINE, onOfflinePlay, usePlayer } from './engine';

/**
 * Shows playback errors as toasts, with a retry (toggle re-requests the last book). Offline there is nothing to retry
 * until the connection is back, so that one just says why. Renders nothing.
 */
export function PlayerToasts() {
  const { error, toggle } = usePlayer();
  const { showToast } = useToast();
  useEffect(() => {
    if (error === MSG_OFFLINE) showToast(error, 'info', { replaceKey: 'offline-play' });
    else if (error) showToast(error, 'error', { action: { label: 'Try again', onClick: toggle }, durationMs: 8000 });
  }, [error, showToast, toggle]);
  useEffect(() => onOfflinePlay(() => showToast(MSG_OFFLINE, 'info', { replaceKey: 'offline-play' })), [showToast]);
  return null;
}
