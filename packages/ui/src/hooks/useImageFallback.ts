import { useState } from 'react';

/**
 * The URL to show, or null when there is none or it failed to load: render a placeholder for null.
 * Pass `onError` to the `<img>`. A failure is remembered per URL, so a new URL gets a fresh try with no effect.
 */
export function useImageFallback(url: string | null | undefined): [shown: string | null, onError: () => void] {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = url && failed !== url ? url : null;
  return [shown, () => setFailed(url ?? null)];
}
