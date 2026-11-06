import { useEffect } from 'react';

export const APP_NAME = 'Storyshelf';

/** "Peter Rabbit · Storyshelf". Without a title, just the app name. */
export const pageTitle = (title?: string | null): string => (title ? `${title} · ${APP_NAME}` : APP_NAME);

/** Sets the tab and history title for the screen. Pass nothing while the name is still loading. */
export function useDocumentTitle(title?: string | null): void {
  useEffect(() => {
    document.title = pageTitle(title);
  }, [title]);
}
