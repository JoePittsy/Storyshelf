// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  BOOK_COLOURS,
  DEFAULT_BOOK,
  applyStoredBookColour,
  iconPreview,
  linksFor,
  setBookColour,
  useBookColour,
} from './bookColour';

const href = (rel: string) => document.head.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');
const amber = BOOK_COLOURS.find((c) => c.id === 'amber') ?? DEFAULT_BOOK;

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML =
    '<link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">';
});

describe('book colours', () => {
  it('is a good long list of distinct colours, Paper first as the default', () => {
    expect(BOOK_COLOURS.length).toBeGreaterThanOrEqual(16);
    expect(DEFAULT_BOOK.id).toBe('paper');
    expect(new Set(BOOK_COLOURS.map((c) => c.id)).size).toBe(BOOK_COLOURS.length);
    expect(new Set(BOOK_COLOURS.map((c) => c.hex)).size).toBe(BOOK_COLOURS.length);
    for (const c of BOOK_COLOURS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps the root files for the default, and points a colour at its pre-rendered set', () => {
    expect(linksFor(DEFAULT_BOOK)).toEqual({
      icon: '/icon.svg',
      appleTouch: '/apple-touch-icon.png',
      manifest: '/manifest.webmanifest',
    });
    const l = linksFor(amber);
    expect(l.appleTouch).toBe('/book/amber/apple-touch-icon.png');
    expect(l.manifest).toBe('/book/amber/manifest.webmanifest');
    expect(decodeURIComponent(l.icon)).toContain('.book { fill: #f2a65a; }');
  });

  it('draws each preview in its own colour', () => {
    expect(decodeURIComponent(iconPreview(amber))).toContain('.book { fill: #f2a65a; }');
  });

  it('applies, stores and announces a choice, and applies the stored one at boot', () => {
    const { result } = renderHook(() => useBookColour());
    act(() => setBookColour(amber));
    expect(result.current.id).toBe('amber');
    expect(href('apple-touch-icon')).toBe('/book/amber/apple-touch-icon.png');
    expect(href('manifest')).toBe('/book/amber/manifest.webmanifest');
    expect(href('icon')).toMatch(/^data:image\/svg\+xml,/);

    // A fresh page load: the links start at the defaults, and boot puts the stored colour back.
    document.head.innerHTML =
      '<link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">';
    applyStoredBookColour();
    expect(href('manifest')).toBe('/book/amber/manifest.webmanifest');
  });

  it('falls back to the default for a missing or unknown stored colour', () => {
    localStorage.setItem('storyshelf.bookColour', 'chartreuse');
    applyStoredBookColour();
    expect(href('manifest')).toBe('/manifest.webmanifest');
    expect(href('icon')).toBe('/icon.svg');
  });
});
