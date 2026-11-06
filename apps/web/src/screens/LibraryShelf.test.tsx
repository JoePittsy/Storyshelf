// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { Library } from './Library';

const absFetch = vi.mocked(auth.absFetch);

const book = (id: string, title: string, libraryId = 'L1', extra: object = {}) => ({
  id,
  updatedAt: 1,
  libraryId,
  mediaType: 'book',
  progressLastUpdate: 1,
  media: { metadata: { title, authorName: 'Stephen Fry', genres: [] } },
  ...extra,
});

// ABS sends these most recently played first.
const MYTHOS = book('m', 'Mythos');
const HEROES = book('h', 'Heroes');
const OTHER_LIBRARY = book('o', 'Elsewhere', 'L2');
const HIDDEN = book('x', 'Hidden one');
const PODCAST = book('p', 'A podcast', 'L1', { mediaType: 'podcast' });

function serve(inProgress: object[]) {
  absFetch.mockImplementation((path: string) => {
    const u = new URL(path, 'http://x');
    if (path === '/api/libraries')
      return Promise.resolve({ libraries: [{ id: 'L1', name: 'Fiction', mediaType: 'book' }] });
    if (path === '/api/me')
      return Promise.resolve({
        mediaProgress: [
          { libraryItemId: 'm', progress: 0.14, isFinished: false },
          { libraryItemId: 'h', progress: 0.5, isFinished: false },
          { libraryItemId: 'x', progress: 0.5, isFinished: false, hideFromContinueListening: true },
        ],
      });
    if (u.pathname === '/api/me/items-in-progress') return Promise.resolve({ libraryItems: inProgress });
    if (u.pathname.endsWith('/filterdata'))
      return Promise.resolve({ genres: [], tags: [], languages: [], publishers: [], publishedDecades: [] });
    if (u.pathname.endsWith('/search'))
      return Promise.resolve({ book: [{ libraryItem: HEROES }], authors: [], narrators: [], series: [] });
    if (u.pathname.endsWith('/items'))
      return Promise.resolve({ results: [MYTHOS, HEROES], total: 2, limit: 48, page: 0 });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function renderAt(url: string, onPlay = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/" element={<Library onPlay={onPlay} />} />
          <Route path="/book/:id" element={<p>a book</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onPlay;
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const shelf = () => screen.queryByRole('heading', { name: 'Continue listening' });

const hero = () => screen.queryByRole('region', { name: 'Resume listening' });

describe('REQ-54 Resume hero and Continue listening shelf', () => {
  it('puts the most recently played book in the hero and the rest of this library in the shelf', async () => {
    serve([MYTHOS, HEROES, OTHER_LIBRARY, PODCAST, HIDDEN]);
    renderAt('/');
    const heading = await screen.findByRole('heading', { name: 'Continue listening' });
    const row = heading.parentElement?.nextElementSibling as HTMLElement;
    const titles = Array.from(row.querySelectorAll('a')).map((a) => a.textContent);
    expect(within(hero() as HTMLElement).getByRole('link', { name: 'Mythos' })).toBeInTheDocument();
    // Another library's book, a podcast and one hidden from Continue listening stay off both.
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain('Heroes');
  });

  it('resumes the hero book straight away, without opening it', async () => {
    serve([MYTHOS, HEROES]);
    const onPlay = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resume: Mythos' }));
    expect(onPlay).toHaveBeenCalledExactlyOnceWith('m');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/(\?.*)?$/);
  });

  it('resumes a shelf book from its tile play button', async () => {
    serve([MYTHOS, HEROES]);
    const onPlay = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resume Heroes' }));
    expect(onPlay).toHaveBeenCalledExactlyOnceWith('h');
  });

  it('opens the book from the hero title', async () => {
    serve([MYTHOS]);
    const onPlay = renderAt('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Mythos' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/book/m');
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('with one book in progress the hero has it and there is no shelf', async () => {
    serve([MYTHOS]);
    renderAt('/');
    await screen.findByRole('region', { name: 'Resume listening' });
    expect(shelf()).not.toBeInTheDocument();
  });

  it('has no hero when nothing is in progress: the library leads', async () => {
    serve([]);
    renderAt('/');
    await screen.findByText('Mythos');
    expect(hero()).not.toBeInTheDocument();
  });

  it('is hidden when nothing is in progress', async () => {
    serve([]);
    renderAt('/');
    await screen.findByText('Mythos');
    expect(shelf()).not.toBeInTheDocument();
  });

  it('is hidden while searching', async () => {
    serve([MYTHOS]);
    renderAt('/?q=heroes');
    await screen.findByText('Heroes');
    expect(shelf()).not.toBeInTheDocument();
    expect(hero()).not.toBeInTheDocument();
  });

  it('is hidden while a filter is on', async () => {
    serve([MYTHOS]);
    renderAt('/?progress=in-progress');
    await waitFor(() => expect(screen.getAllByText('Mythos').length).toBeGreaterThan(0));
    expect(shelf()).not.toBeInTheDocument();
  });

  it('holds the grid back until the shelf is known, so the tiles never jump down under the pointer', async () => {
    serve([MYTHOS]);
    let release: (v: object) => void = () => undefined;
    const inner = absFetch.getMockImplementation();
    absFetch.mockImplementation((path: string) =>
      path.startsWith('/api/me/items-in-progress')
        ? new Promise((r) => {
            release = r;
          })
        : (inner?.(path) as Promise<unknown>)
    );
    renderAt('/');
    // The books are loaded, but none is shown while the shelf's data is outstanding.
    await waitFor(() => expect(absFetch.mock.calls.some((c) => String(c[0]).includes('/items?'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Heroes')).not.toBeInTheDocument();
    release({ libraryItems: [MYTHOS] });
    // Then the shelf and the grid arrive together.
    expect(await screen.findByText('Heroes')).toBeInTheDocument();
    expect(hero()).toBeInTheDocument();
  });

  it('shows the grid with no shelf, in one go, when nothing is in progress', async () => {
    serve([]);
    renderAt('/');
    expect(await screen.findByText('Heroes')).toBeInTheDocument();
    expect(shelf()).not.toBeInTheDocument();
  });

  it('stays out of the way when ABS fails to list in-progress books', async () => {
    absFetch.mockImplementation((path: string) => {
      if (path.startsWith('/api/me/items-in-progress')) return Promise.reject(new auth.AbsError(500, 'boom'));
      return Promise.resolve({
        libraries: [],
        mediaProgress: [],
        results: [MYTHOS],
        total: 1,
        limit: 48,
        page: 0,
        genres: [],
      });
    });
    renderAt('/');
    await waitFor(() => expect(absFetch).toHaveBeenCalled());
    expect(shelf()).not.toBeInTheDocument();
  });
});
