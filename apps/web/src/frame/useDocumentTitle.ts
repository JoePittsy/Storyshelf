import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { rememberTitle } from './routeTrail';

export const APP_NAME = 'Storyshelf';

/** "Peter Rabbit · Storyshelf". Without a title, just the app name. */
export const pageTitle = (title?: string | null): string => (title ? `${title} · ${APP_NAME}` : APP_NAME);

/** Sets the tab and history title for the screen. Pass nothing while the name is still loading. */
export function useDocumentTitle(title?: string | null): void {
  const { key } = useLocation();
  useEffect(() => {
    document.title = pageTitle(title);
    // A back link on the next page names this one, as it was when the listener left it.
    if (title) rememberTitle(key, title);
  }, [title, key]);
}
