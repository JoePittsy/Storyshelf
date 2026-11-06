// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
    if (path === '/api/libraries') return Promise.resolve({ libraries: [{ id: 'L1', name: 'Fiction', mediaType: 'book' }] });
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
    </QueryClientProvider>,
  );
  return onPlay;
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const shelf = () => screen.queryByRole('heading', { name: 'Continue listening' });

describe('REQ-54 Continue listening shelf', () => {
  it('lists in-progress books of this library, most recently played first', async () => {
    serve([MYTHOS, HEROES, OTHER_LIBRARY, PODCAST, HIDDEN]);
    renderAt('/');
    const heading = await screen.findByRole('heading', { name: 'Continue listening' });
    const row = heading.parentElement?.nextElementSibling as HTMLElement;
    const titles = Array.from(row.querySelectorAll('a')).map((a) => a.textContent);
    expect(titles[0]).toContain('Mythos');
    expect(titles[1]).toContain('Heroes');
    // Another library's book, a podcast and one hidden from Continue listening stay off the shelf.
    expect(titles).toHaveLength(2);
  });

  it('resumes straight away from the play button, without opening the book', async () => {
    serve([MYTHOS, HEROES]);
    const onPlay = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resume Mythos' }));
    expect(onPlay).toHaveBeenCalledExactlyOnceWith('m');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/(\?.*)?$/);
  });

  it('opens the book from the tile itself', async () => {
    serve([MYTHOS]);
    const onPlay = renderAt('/');
    const heading = await screen.findByRole('heading', { name: 'Continue listening' });
    const tile = heading.parentElement?.nextElementSibling?.querySelector('a') as HTMLElement;
    await userEvent.click(tile);
    expect(screen.getByTestId('where')).toHaveTextContent('/book/m');
    expect(onPlay).not.toHaveBeenCalled();
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
  });

  it('is hidden while a filter is on', async () => {
    serve([MYTHOS]);
    renderAt('/?progress=in-progress');
    await waitFor(() => expect(screen.getAllByText('Mythos').length).toBeGreaterThan(0));
    expect(shelf()).not.toBeInTheDocument();
  });

  it('stays out of the way when ABS fails to list in-progress books', async () => {
    absFetch.mockImplementation((path: string) => {
      if (path.startsWith('/api/me/items-in-progress')) return Promise.reject(new auth.AbsError(500, 'boom'));
      return Promise.resolve({ libraries: [], mediaProgress: [], results: [MYTHOS], total: 1, limit: 48, page: 0, genres: [] });
    });
    renderAt('/');
    await waitFor(() => expect(absFetch).toHaveBeenCalled());
    expect(shelf()).not.toBeInTheDocument();
  });
});
