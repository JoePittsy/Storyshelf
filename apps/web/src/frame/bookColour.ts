// The colour of "the book", the tallest spine in the app icon, chosen by the user before installing.
// One list (icons/book-colours.json) drives both this and icons/render.cjs, which pre-renders every colour's icons
// and manifest into public/book/<id>/. Applying a choice points three links at it:
//   - the browser tab icon: drawn here from the favicon template, so it changes at once;
//   - apple-touch-icon: iOS copies it when the user taps Add to Home Screen, so it must be set before then;
//   - the manifest: Chromium installs from it, and re-checks an installed app's manifest later, so the choice is
//     applied at every boot (main.tsx) and the same manifest stays linked.
// An app already on a Home Screen keeps the icon it was installed with.
import { useSyncExternalStore } from 'react';
import colours from '../../icons/book-colours.json';
import favicon from '../../icons/favicon.svg?raw';
import appIcon from '../../icons/app-icon.svg?raw';

export interface BookColour {
  id: string;
  name: string;
  hex: string;
}

export const BOOK_COLOURS: readonly BookColour[] = colours;
export const DEFAULT_BOOK = BOOK_COLOURS[0];
const KEY = 'storyshelf.bookColour';

const byId = (id: string | null) => BOOK_COLOURS.find((c) => c.id === id) ?? null;

function readStored(): BookColour | null {
  try {
    return byId(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

const recolour = (svg: string, hex: string) => svg.replace(/\.book \{ fill: [^;]+; \}/, `.book { fill: ${hex}; }`);
const dataUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** The full app icon in a colour, as an image URL: the swatches in the picker. */
export const iconPreview = (c: BookColour) => dataUrl(recolour(appIcon, c.hex));

/** The link hrefs a colour sets. The default keeps the root files a visitor gets before choosing. */
export function linksFor(c: BookColour): { icon: string; appleTouch: string; manifest: string } {
  if (c.id === DEFAULT_BOOK.id)
    return { icon: '/icon.svg', appleTouch: '/apple-touch-icon.png', manifest: '/manifest.webmanifest' };
  return {
    icon: dataUrl(recolour(favicon, c.hex)),
    appleTouch: `/book/${c.id}/apple-touch-icon.png`,
    manifest: `/book/${c.id}/manifest.webmanifest`,
  };
}

function setLink(rel: string, href: string, doc: Document) {
  const el = doc.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (el && el.getAttribute('href') !== href) el.setAttribute('href', href);
}

/** Points the tab icon, apple-touch-icon and manifest links at a colour. */
export function applyBookColour(c: BookColour, doc: Document = document): void {
  const l = linksFor(c);
  setLink('icon', l.icon, doc);
  setLink('apple-touch-icon', l.appleTouch, doc);
  setLink('manifest', l.manifest, doc);
}

let current: BookColour = DEFAULT_BOOK;
const listeners = new Set<() => void>();

/** At boot, before rendering: links the stored colour's icons and manifest, so Chromium reads the right one. */
export function applyStoredBookColour(): void {
  current = readStored() ?? DEFAULT_BOOK;
  applyBookColour(current);
}

/** Chooses, stores and applies a colour. */
export function setBookColour(c: BookColour): void {
  current = c;
  try {
    localStorage.setItem(KEY, c.id);
  } catch {
    // Storage blocked: the colour lasts for this page.
  }
  applyBookColour(c);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useBookColour(): BookColour {
  return useSyncExternalStore(subscribe, () => current);
}
