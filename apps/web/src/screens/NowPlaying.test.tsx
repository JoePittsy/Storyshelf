// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));
vi.mock('../player/engine', async (orig) => ({
  ...(await orig<typeof import('../player/engine')>()),
  usePlayer: vi.fn(),
}));

import * as auth from '../api/auth';
import * as engine from '../player/engine';
import { NowPlaying } from './NowPlaying';

const chapters = [
  { id: 0, start: 0, end: 1038, title: 'Part I' },
  { id: 1, start: 1038, end: 2427, title: 'Part II' },
  { id: 2, start: 2427, end: 3784, title: 'Part III' },
];

/** Which of the screen's media queries match: a phone, a wide desk, or the width between. */
function screenIs(kind: 'phone' | 'wide') {
  window.matchMedia = ((query: string) => ({
    matches: kind === 'phone' ? query === '(width < 40em)' : query === '(width >= 60em)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/now-playing']}>
          <Routes>
            <Route path="/now-playing" element={<NowPlaying />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** The buttons a person sees, leaving out the rows of closed popovers (jsdom does not hide them). */
const visibleButtons = (root: HTMLElement) =>
  within(root)
    .getAllByRole('button')
    .filter((b) => !b.closest('[popover]'));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  // Nothing the screen asks the server for matters here; leave every request pending.
  vi.mocked(auth.absFetch).mockImplementation(() => new Promise(() => {}));
  vi.mocked(engine.usePlayer).mockReturnValue({
    status: 'paused',
    item: { id: 'li_1', title: 'The Adventure of the Copper Beeches', author: 'Arthur Conan Doyle', coverUrl: '' },
    position: 711,
    duration: 3784,
    chapters,
    chapterIndex: 0,
    rate: 1,
    defaultRate: 1,
    skipBack: 30,
    skipForward: 30,
    rewindOnResume: false,
    sleep: null,
    sleepFrom: 0,
    error: null,
    restored: false,
    ended: false,
    handoff: null,
    toggle: vi.fn(),
    seek: vi.fn(),
    skip: vi.fn(),
    setRate: vi.fn(),
    setSleep: vi.fn(),
  } as unknown as ReturnType<typeof engine.usePlayer>);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Now Playing on a phone', () => {
  it('has one Bookmarks control in a tray of five: speed, sleep, chapters, bookmarks and history', () => {
    screenIs('phone');
    renderScreen();
    const tray = screen.getByRole('group', { name: 'Player options' });
    expect(visibleButtons(tray).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Playback speed 1.0×',
      'Sleep timer',
      'Chapters',
      'Bookmarks',
      'History',
    ]);
    expect(screen.queryByRole('button', { name: 'Add bookmark' })).toBeNull();
  });

  it('shows an end-of-chapter timer in the tray as its time left, which fits the cell', () => {
    screenIs('phone');
    vi.mocked(engine.usePlayer).mockReturnValue({
      ...engine.usePlayer(),
      sleep: { kind: 'chapter', endsAt: 1038 },
    } as ReturnType<typeof engine.usePlayer>);
    renderScreen();
    // 1038 - 0.5 - 711 = 326.5 s, shown rounded up.
    expect(screen.getByRole('button', { name: 'Sleep timer, End of chapter, 5:27' })).toHaveTextContent(/^5:27$/);
  });

  it('names the progress modes Whole book and This chapter', () => {
    screenIs('phone');
    renderScreen();
    expect(screen.getByRole('radio', { name: 'Whole book' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'This chapter' })).toBeInTheDocument();
  });
});

describe('Now Playing on a desk', () => {
  it('has one Bookmarks pill and no separate Add bookmark', () => {
    screenIs('wide');
    renderScreen();
    expect(screen.getByRole('button', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add bookmark' })).toBeNull();
  });

  it('reads the speed in tenths, as the phone and Settings do', () => {
    screenIs('wide');
    renderScreen();
    expect(screen.getByRole('button', { name: 'Playback speed 1.0×' })).toHaveTextContent('1.0×');
  });

  it('uses the phone’s words for the progress modes', () => {
    screenIs('wide');
    renderScreen();
    expect(screen.getByRole('radio', { name: 'Whole book' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'This chapter' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sleep' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Book' })).toBeNull();
  });

  it('puts the chapter and its place on one line, like the phone’s chapter row', () => {
    screenIs('wide');
    renderScreen();
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Part I · 1 of 3')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Chapter 1 of 3/)).toBeNull();
  });

  it('names the shortcuts button beside car mode, with the same kind of tooltip, and opens the list', async () => {
    screenIs('wide');
    renderScreen();
    expect(screen.getByRole('button', { name: 'Car mode' })).toHaveAttribute('title', 'Car mode (C)');
    const keys = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(keys).toHaveAttribute('title', 'Keyboard shortcuts (?)');
    await userEvent.click(keys);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent('Bookmark where you are');
  });
});

describe('Back on Now Playing', () => {
  const settle = () => new Promise<void>((r) => setTimeout(r, 40));
  const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

  /** The real browser history (jsdom's), as the app has it: the library, then the player. */
  async function renderInBrowser() {
    await settle(); // an earlier test's overlay may still be taking its history entry off
    Element.prototype.scrollIntoView ??= () => {}; // jsdom has none; the Chapters list scrolls to the current one
    window.history.replaceState(null, '', '/');
    window.history.pushState(null, '', '/now-playing');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <BrowserRouter>
            <Where />
            <Routes>
              <Route path="/" element={<p>Library</p>} />
              <Route path="/now-playing" element={<NowPlaying />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
    await settle();
  }

  it('closes the Chapters sheet without changing the route, then the next Back leaves the player', async () => {
    screenIs('phone');
    await renderInBrowser();
    const chapters = screen.getByRole('button', { name: 'Chapters' });
    await userEvent.click(chapters);
    expect(screen.getByRole('dialog', { name: 'Chapters' })).toBeInTheDocument();
    await settle();
    window.history.back();
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent('/now-playing');
    expect(screen.getByRole('button', { name: 'Chapters' })).toHaveFocus();
    window.history.back();
    await settle();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
    expect(screen.getByText('Library')).toBeInTheDocument();
  });

  it('closing the sheet with Done leaves no entry behind: one Back leaves the player', async () => {
    screenIs('phone');
    await renderInBrowser();
    await userEvent.click(screen.getByRole('button', { name: 'Chapters' }));
    await settle();
    await userEvent.keyboard('{Escape}');
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    window.history.back();
    await settle();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });
});
