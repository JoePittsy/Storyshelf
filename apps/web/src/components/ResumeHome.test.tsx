// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

// The player, as the listener has it: nothing loaded until a test starts a book.
const player = vi.hoisted(() => {
  const idle = {
    item: null as { id: string } | null,
    status: 'paused',
    position: 0,
    duration: 0,
    chapters: [],
    chapterIndex: -1,
  };
  let state = idle;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (cb: () => void) => (subs.add(cb), () => void subs.delete(cb)),
    set(next: Partial<typeof idle>) {
      state = { ...state, ...next };
      subs.forEach((cb) => cb());
    },
    reset() {
      state = idle;
    },
  };
});
vi.mock('../player/engine', async (orig) => {
  const { useSyncExternalStore } = await import('react');
  return {
    ...(await orig<typeof import('../player/engine')>()),
    usePlayer: () => ({ ...useSyncExternalStore(player.subscribe, player.get), toggle: vi.fn() }),
  };
});

import * as auth from '../api/auth';
import { ResumeHome } from './ResumeHome';

const absFetch = vi.mocked(auth.absFetch);

const book = (id: string, title: string, series?: { name: string; sequence: string }) => ({
  id,
  updatedAt: 1,
  libraryId: 'L1',
  mediaType: 'book',
  progressLastUpdate: 1,
  media: {
    duration: 3600,
    metadata: { title, authorName: 'Arthur Conan Doyle', series: series && { id: 'S', ...series } },
  },
});

const COPPER = book('b2', 'The Adventure of the Copper Beeches', { name: 'Sherlock Holmes', sequence: '2' });
const RABBIT = book('r', 'The Velveteen Rabbit');

function serve({ inProgress, series }: { inProgress: object[]; series: object[] }) {
  absFetch.mockImplementation((path: string) => {
    const u = new URL(path, 'http://x');
    if (path === '/api/me')
      return Promise.resolve({
        mediaProgress: (inProgress as { id: string }[]).map((b) => ({
          libraryItemId: b.id,
          progress: 0.3,
          isFinished: false,
        })),
      });
    if (u.pathname === '/api/me/items-in-progress') return Promise.resolve({ libraryItems: inProgress });
    if (u.pathname === '/api/libraries/L1/personalized')
      return Promise.resolve([
        { id: 'continue-listening', entities: inProgress },
        { id: 'continue-series', entities: series },
      ]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderHome(onPlay = vi.fn(), qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const view = render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <ResumeHome libraryId="L1" onPlay={onPlay} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onPlay, view, qc };
}

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  player.reset();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ResumeHome: Continue series', () => {
  it('shows the next book of a series even when nothing is in progress, and starts it', async () => {
    serve({ inProgress: [], series: [COPPER] });
    const { onPlay } = renderHome();
    expect(await screen.findByRole('heading', { name: 'Continue series' })).toBeInTheDocument();
    expect(screen.getByText('Book 2 of Sherlock Holmes')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resume listening' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play The Adventure of the Copper Beeches' }));
    expect(onPlay).toHaveBeenCalledWith('b2');
  });

  it('says Resume with the time left on the hero action, as the book page does, and not again in the status', async () => {
    serve({ inProgress: [RABBIT], series: [] });
    renderHome();
    const hero = await screen.findByRole('region', { name: 'Resume listening' });
    const action = within(hero).getByRole('button', { name: /^Resume · 42m left: The Velveteen Rabbit$/ });
    expect(action.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(within(hero).getAllByText(/left/)).toHaveLength(1);
  });

  it('sits below the resume hero when a book is in progress', async () => {
    serve({ inProgress: [RABBIT], series: [COPPER] });
    renderHome();
    const hero = await screen.findByRole('region', { name: 'Resume listening' });
    const shelf = await screen.findByRole('heading', { name: 'Continue series' });
    expect(hero.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not repeat a book that is already in Continue listening', async () => {
    serve({ inProgress: [COPPER], series: [COPPER] });
    renderHome();
    await screen.findByRole('region', { name: 'Resume listening' });
    await waitFor(() => expect(absFetch).toHaveBeenCalledWith(expect.stringContaining('/personalized')));
    expect(screen.queryByRole('heading', { name: 'Continue series' })).not.toBeInTheDocument();
  });

  it('renders nothing when there is nothing to carry on with', async () => {
    serve({ inProgress: [], series: [] });
    const { view } = renderHome();
    await waitFor(() => expect(absFetch).toHaveBeenCalledWith(expect.stringContaining('/personalized')));
    await new Promise((r) => setTimeout(r, 20));
    expect(view.container).toBeEmptyDOMElement();
  });
});

const BLUE = book('b1', 'The Adventure of the Blue Carbuncle', { name: 'Sherlock Holmes', sequence: '1' });
const PETER = book('p', 'The Tale of Peter Rabbit');

/** A server that keeps each book's progress record, and hides one when asked, as ABS 2.37.2 does. */
function serveProgress(inProgress: { id: string }[], series: object[] = []) {
  const hidden = new Set<string>();
  const record = (id: string) => ({
    id: `mp_${id}`,
    libraryItemId: id,
    currentTime: 600,
    duration: 3600,
    progress: 0.3,
    isFinished: false,
    hideFromContinueListening: hidden.has(id),
    lastUpdate: 5,
  });
  absFetch.mockImplementation((path: string, init: RequestInit = {}) => {
    const u = new URL(path, 'http://x');
    const method = init.method ?? 'GET';
    const hide = u.pathname.match(/^\/api\/me\/progress\/mp_(\w+)\/remove-from-continue-listening$/);
    if (hide) {
      hidden.add(hide[1]);
      return Promise.resolve({});
    }
    const one = u.pathname.match(/^\/api\/me\/progress\/(\w+)$/);
    if (one && method === 'GET') return Promise.resolve(record(one[1]));
    if (one && method === 'PATCH') {
      if (
        (JSON.parse(init.body as string) as { hideFromContinueListening?: boolean }).hideFromContinueListening === false
      )
        hidden.delete(one[1]);
      return Promise.resolve(undefined);
    }
    if (path === '/api/me') return Promise.resolve({ mediaProgress: inProgress.map((b) => record(b.id)) });
    if (u.pathname === '/api/me/items-in-progress') return Promise.resolve({ libraryItems: inProgress });
    if (u.pathname === '/api/libraries/L1/personalized')
      return Promise.resolve([{ id: 'continue-series', entities: series }]);
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
}

const heroTitle = async () =>
  (await screen.findByRole('region', { name: 'Resume listening' })).querySelector('a')?.textContent;
/** Opens a book's menu and picks `name` from it. */
async function choose(menu: string, name: string) {
  const trigger = screen.getByRole('button', { name: menu });
  await userEvent.click(trigger);
  const panel = document.getElementById(trigger.getAttribute('popovertarget') ?? '')!;
  await userEvent.click(within(panel).getByRole('button', { name, hidden: true }));
}

describe('ResumeHome: Remove from Continue listening', () => {
  it('is offered on the hero and on each Continue listening tile, but not on Continue series', async () => {
    serveProgress([RABBIT, PETER], [BLUE]);
    renderHome();
    await screen.findByRole('heading', { name: 'Continue series' });
    expect(screen.getByRole('button', { name: 'More for The Velveteen Rabbit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More for The Tale of Peter Rabbit' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More for The Adventure of the Blue Carbuncle' })
    ).not.toBeInTheDocument();
  });

  it('removing the hero puts the next book in its place, with an Undo that brings it back', async () => {
    serveProgress([RABBIT, PETER, COPPER]);
    renderHome();
    expect(await heroTitle()).toBe('The Velveteen Rabbit');
    await choose('More for The Velveteen Rabbit', 'Remove from Continue listening');
    expect(await screen.findByText('Removed from Continue listening')).toBeInTheDocument();
    expect(absFetch).toHaveBeenCalledWith('/api/me/progress/mp_r/remove-from-continue-listening');
    await waitFor(async () => expect(await heroTitle()).toBe('The Tale of Peter Rabbit'));
    // The new hero is no longer on the shelf beneath it; the shelf keeps the rest.
    expect(screen.queryByRole('button', { name: 'More for The Velveteen Rabbit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume The Tale of Peter Rabbit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume The Adventure of the Copper Beeches' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await heroTitle()).toBe('The Velveteen Rabbit'));
  });

  it('removing a shelf book keeps the hero and takes the tile off the shelf', async () => {
    serveProgress([RABBIT, PETER, COPPER]);
    renderHome();
    await screen.findByRole('button', { name: 'More for The Tale of Peter Rabbit' });
    await choose('More for The Tale of Peter Rabbit', 'Remove from Continue listening');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Resume The Tale of Peter Rabbit' })).not.toBeInTheDocument()
    );
    expect(await heroTitle()).toBe('The Velveteen Rabbit');
  });
});

describe('ResumeHome: Recently added', () => {
  const added = (b: ReturnType<typeof book>) => ({ ...b, addedAt: Date.now() - 3 * 86_400_000 });
  /** ABS with these books in progress (and `finished` done), Continue series and Recently added shelves. */
  function serveRecent({
    inProgress = [],
    series = [],
    recent,
    finished = [],
  }: {
    inProgress?: { id: string }[];
    series?: object[];
    recent: object[];
    finished?: string[];
  }) {
    absFetch.mockImplementation((path: string) => {
      const u = new URL(path, 'http://x');
      if (path === '/api/me')
        return Promise.resolve({
          mediaProgress: [
            ...inProgress.map((b) => ({ libraryItemId: b.id, progress: 0.3, isFinished: false })),
            ...finished.map((id) => ({ libraryItemId: id, progress: 1, isFinished: true })),
          ],
        });
      if (u.pathname === '/api/me/items-in-progress') return Promise.resolve({ libraryItems: inProgress });
      if (u.pathname === '/api/libraries/L1/personalized')
        return Promise.resolve([
          { id: 'continue-series', entities: series },
          { id: 'recently-added', entities: recent },
        ]);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  }

  it('is the whole of home in a new library with nothing begun: each book to start, with when it was added', async () => {
    serveRecent({ recent: [added(BLUE), added(RABBIT)] });
    const { onPlay } = renderHome();
    expect(await screen.findByRole('heading', { name: 'Recently added' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resume listening' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Added 3 days ago')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Play The Velveteen Rabbit' }));
    expect(onPlay).toHaveBeenCalledWith('r');
  });

  it('sits below Continue series, and repeats no book from the hero, the shelves above or the finished pile', async () => {
    serveRecent({
      inProgress: [RABBIT, PETER],
      series: [COPPER],
      recent: [added(RABBIT), added(PETER), added(COPPER), added(BLUE), added(book('g', 'La Grande Bretèche'))],
      finished: ['g'],
    });
    renderHome();
    const recent = await screen.findByRole('heading', { name: 'Recently added' });
    const series = screen.getByRole('heading', { name: 'Continue series' });
    expect(series.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play The Adventure of the Blue Carbuncle' })).toBeInTheDocument();
    expect(screen.getAllByText('Added 3 days ago')).toHaveLength(1);
    expect(screen.queryByText('La Grande Bretèche')).not.toBeInTheDocument();
  });

  it('asks ABS once for both shelves', async () => {
    serveRecent({ series: [COPPER], recent: [added(BLUE)] });
    renderHome();
    await screen.findByRole('heading', { name: 'Recently added' });
    expect(absFetch.mock.calls.filter(([p]) => p.includes('/personalized'))).toHaveLength(1);
  });

  it('is hidden when every recent book is accounted for', async () => {
    serveRecent({ inProgress: [RABBIT], recent: [added(RABBIT)] });
    renderHome();
    await screen.findByRole('region', { name: 'Resume listening' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('heading', { name: 'Recently added' })).not.toBeInTheDocument();
  });
});

describe('ResumeHome: starting a book from home', () => {
  const added = (b: ReturnType<typeof book>) => ({ ...b, addedAt: Date.now() - 3 * 86_400_000 });
  const DARK = book('d', 'Dark Meridian');
  const FAR = book('f', 'Far Signal');
  const GLASS = book('g', 'Glasshouse');
  const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  /** An ABS whose books in progress can change, as they do once the listener starts a book and the player saves. */
  function serveLive(inProgress: ReturnType<typeof book>[], recent: ReturnType<typeof book>[]) {
    const server = { inProgress, recent, hidden: new Set<string>() };
    absFetch.mockImplementation((path: string, init: RequestInit = {}) => {
      const u = new URL(path, 'http://x');
      const hide = u.pathname.match(/^\/api\/me\/progress\/mp_(\w+)\/remove-from-continue-listening$/);
      if (hide) {
        server.hidden.add(hide[1]);
        return Promise.resolve({});
      }
      if (u.pathname.startsWith('/api/me/progress/')) {
        if (init.method === 'PATCH') return Promise.resolve(undefined);
        const id = u.pathname.split('/').pop()?.replace('mp_', '');
        return Promise.resolve({ id: `mp_${id}`, libraryItemId: id, progress: 0.3, currentTime: 600, duration: 3600 });
      }
      if (path === '/api/me')
        return Promise.resolve({
          mediaProgress: server.inProgress.map((b) => ({
            id: `mp_${b.id}`,
            libraryItemId: b.id,
            progress: 0.3,
            isFinished: false,
            hideFromContinueListening: server.hidden.has(b.id),
          })),
        });
      if (u.pathname === '/api/me/items-in-progress') return Promise.resolve({ libraryItems: server.inProgress });
      if (u.pathname === '/api/libraries/L1/personalized')
        return Promise.resolve([
          { id: 'continue-series', entities: [] },
          { id: 'recently-added', entities: server.recent },
        ]);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    return server;
  }

  /** Pressing Play loads the book into the player. */
  const loadsBook = () => vi.fn((id: string) => player.set({ item: { id } }));
  /** The player has saved: ABS now has the book as the one most recently played, and the app refetches. */
  const saved = async (server: ReturnType<typeof serveLive>, qc: QueryClient, b: ReturnType<typeof book>) => {
    server.inProgress = [b, ...server.inProgress.filter((x) => x.id !== b.id)];
    await qc.invalidateQueries();
  };
  /** The play buttons on the shelf with this heading, in order. */
  const shelf = (heading: string) => {
    const region = screen.getByRole('heading', { name: heading }).closest('[class*="_shelf_"]') as HTMLElement;
    return within(region)
      .getAllByRole('button', { name: /^(Play|Resume) / })
      .map((b) => b.getAttribute('aria-label'));
  };

  it('keeps the tile in its place, and focus on its button, when Play is pressed and ABS then lists it as begun', async () => {
    const server = serveLive([GLASS], [added(DARK), added(FAR), added(BLUE)]);
    const qc = newClient();
    const onPlay = loadsBook();
    renderHome(onPlay, qc);
    const play = await screen.findByRole('button', { name: 'Play Dark Meridian' });
    expect(shelf('Recently added')).toEqual([
      'Play Dark Meridian',
      'Play Far Signal',
      'Play The Adventure of the Blue Carbuncle',
    ]);

    await userEvent.click(play);
    expect(onPlay).toHaveBeenCalledWith('d');
    // The book is the player's now, and its tile has not moved.
    expect(screen.getByRole('button', { name: 'Play Dark Meridian' })).toBe(play);

    await saved(server, qc, DARK);
    await waitFor(() => expect(play).toHaveAccessibleName('Resume Dark Meridian'));
    expect(shelf('Recently added')).toEqual([
      'Resume Dark Meridian',
      'Play Far Signal',
      'Play The Adventure of the Blue Carbuncle',
    ]);
    expect(play).toBeInTheDocument();
    expect(document.activeElement).toBe(play);
    expect(screen.getAllByText('Dark Meridian')).toHaveLength(1);
  });

  it('keeps the hero and the order of Continue listening when the data later reports the new book first', async () => {
    const server = serveLive([GLASS, FAR], [added(DARK), added(BLUE)]);
    const qc = newClient();
    renderHome(loadsBook(), qc);
    expect(await heroTitle()).toBe('Glasshouse');
    await userEvent.click(await screen.findByRole('button', { name: 'Play Dark Meridian' }));
    await saved(server, qc, DARK);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume Dark Meridian' })).toBeInTheDocument());
    expect(await heroTitle()).toBe('Glasshouse');
    expect(shelf('Continue listening')).toEqual(['Resume Far Signal']);
    expect(screen.getAllByText('Dark Meridian')).toHaveLength(1);
  });

  it('still removes a book from Continue listening at once, after one has been started', async () => {
    const server = serveLive([GLASS, FAR, PETER], [added(DARK)]);
    const qc = newClient();
    renderHome(loadsBook(), qc);
    await userEvent.click(await screen.findByRole('button', { name: 'Play Dark Meridian' }));
    await saved(server, qc, DARK);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume Dark Meridian' })).toBeInTheDocument());
    await choose('More for Far Signal', 'Remove from Continue listening');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resume Far Signal' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Resume The Tale of Peter Rabbit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume Dark Meridian' })).toBeInTheDocument();
    expect(await heroTitle()).toBe('Glasshouse');
  });

  it('builds home afresh on the next visit, with the book now playing as the hero', async () => {
    const server = serveLive([GLASS, FAR], [added(DARK), added(BLUE)]);
    const qc = newClient();
    const first = renderHome(loadsBook(), qc);
    expect(await heroTitle()).toBe('Glasshouse');
    await userEvent.click(await screen.findByRole('button', { name: 'Play Dark Meridian' }));
    first.view.unmount();
    // Away and back before the player has saved: ABS, and the cache, still have Glasshouse as the latest.
    renderHome(vi.fn(), qc);
    await waitFor(async () => expect(await heroTitle()).toBe('Dark Meridian'));
    expect(screen.queryByRole('button', { name: 'Play Dark Meridian' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Dark Meridian')).toHaveLength(1);
    // Once ABS has heard of it, home is as it was.
    await saved(server, qc, DARK);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume Glasshouse' })).toBeInTheDocument());
    expect(await heroTitle()).toBe('Dark Meridian');
  });

  it('keeps the book that was already playing when home appeared off the shelves beneath the hero', async () => {
    serveLive([GLASS], [added(DARK), added(BLUE)]);
    player.set({ item: { id: 'd' } });
    renderHome();
    expect(await heroTitle()).toBe('Dark Meridian');
    expect(screen.getAllByText('Dark Meridian')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Resume Glasshouse' })).toBeInTheDocument();
  });
});
