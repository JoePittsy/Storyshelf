// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));
vi.mock('../player/engine', () => ({ usePlayer: vi.fn() }));

import * as auth from '../api/auth';
import { usePlayer } from '../player/engine';
import type { PlayerState } from '../player/engine';
import { Author } from './Author';
import { NowPlaying } from './NowPlaying';
import { Series } from './Series';

const absFetch = vi.mocked(auth.absFetch);

const book = (id: string, title: string, extra: object = {}) => ({
  id,
  updatedAt: 1,
  media: { metadata: { title, authorName: 'Neil Gaiman', ...extra } },
});
const inSeries = (id: string, title: string, sequence: string) =>
  book(id, title, { series: { id: 's1', name: 'The Sandman', sequence } });

const author = {
  id: 'a1',
  name: 'Zoë Wanamaker',
  description: '<p>Actor and <b>narrator</b>.</p><script>alert(1)</script>',
  imagePath: null,
  updatedAt: 5,
  libraryId: 'lib1',
  libraryItems: [book('x', 'Solo'), inSeries('b2', 'Act II', '2'), inSeries('b1', 'Act I', '1')],
  series: [{ id: 's1', name: 'The Sandman', items: [inSeries('b2', 'Act II', '2'), inSeries('b1', 'Act I', '1')] }],
};

const progressList = [
  { libraryItemId: 'b1', progress: 0.4, isFinished: false, currentTime: 1, id: 'p', duration: 1, lastUpdate: 1 },
];

/** Serve ABS responses by path. */
function serve(routes: Record<string, unknown>) {
  absFetch.mockImplementation((path: string) => {
    if (path === '/api/me') return Promise.resolve({ mediaProgress: progressList });
    const hit = Object.entries(routes).find(([k]) => path.startsWith(k));
    if (!hit) return Promise.reject(new auth.AbsError(404, 'Not Found'));
    const [, v] = hit;
    return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
  });
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route path="/author/:id" element={<Author />} />
          <Route path="/series/:id" element={<Series />} />
          <Route path="/now-playing" element={<NowPlaying />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Author page', () => {
  it('REQ-27/28/36 shows name, initials without a photo, bio, series in order, then other books with progress', async () => {
    serve({ '/api/authors/a1': author });
    renderAt('/author/a1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Zoë Wanamaker' })).toBeInTheDocument();
    expect(screen.getByText('3 books')).toBeInTheDocument();
    expect(screen.getByText(/Actor and/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    // No photo: no <img>, the avatar draws the initial.
    expect(document.querySelector('header img')).toBeNull();

    const sandman = screen.getByRole('region', { name: 'The Sandman' });
    const titles = within(sandman)
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(titles[0]).toContain('Act I');
    expect(titles[1]).toContain('Act II');
    expect(within(sandman).getByText('#1')).toBeInTheDocument();
    expect(within(sandman).getByText('#2')).toBeInTheDocument();
    expect(within(sandman).getByRole('link', { name: /^Act I(?!I)/ })).toHaveAttribute('href', '/book/b1');
    expect(within(sandman).getAllByRole('progressbar', { name: 'Progress through Act I', hidden: true })[0]).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(screen.getByRole('region', { name: 'Other books' })).toHaveTextContent('Solo');
  });

  it('REQ-27 links the series name to its page', async () => {
    serve({ '/api/authors/a1': author });
    renderAt('/author/a1');
    await userEvent.click(await screen.findByRole('button', { name: 'The Sandman, open' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/series/s1');
  });

  it('REQ-36 uses the photo when there is one', async () => {
    serve({ '/api/authors/a1': { ...author, imagePath: '/x/y.jpg' } });
    renderAt('/author/a1');
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('header img')).toHaveAttribute('src', '/api/authors/a1/image?width=400&format=webp&ts=5');
  });

  it('REQ-36 says not found on a 404, with a way back', async () => {
    serve({});
    renderAt('/author/nope');
    expect(await screen.findByText("We couldn't find that author")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your library' })).toHaveAttribute('href', '/');
  });

  it('offers a retry on other errors', async () => {
    serve({ '/api/authors/a1': new auth.AbsError(500, 'boom') });
    renderAt('/author/a1');
    // The hook retries twice (1s, 2s backoff) before giving up.
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeInTheDocument();
  }, 10000);
});

describe('Series page', () => {
  const seriesRoutes = {
    '/api/series/s1': { id: 's1', name: 'The Sandman', description: null, libraryId: 'lib1' },
    '/api/libraries/lib1/items': { results: [inSeries('b2', 'Act II', '2'), inSeries('b1', 'Act I', '1')] },
    '/api/libraries/lib1/authors': { authors: [{ id: 'a9', name: 'Neil Gaiman' }] },
  };

  it('REQ-30/28 shows name, linked author, count, books in order with badges and progress', async () => {
    serve(seriesRoutes);
    renderAt('/series/s1');
    expect(await screen.findByRole('heading', { level: 1, name: 'The Sandman' })).toBeInTheDocument();
    expect(await screen.findByText('2 books')).toBeInTheDocument();
    const links = (await screen.findAllByRole('link')).filter((l) => l.getAttribute('href')?.startsWith('/book/'));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/book/b1', '/book/b2']);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress through Act I', hidden: true })).toHaveAttribute('aria-valuenow', '40');
    await userEvent.click(await screen.findByRole('button', { name: 'Neil Gaiman, open' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/author/a9');
  });

  it('REQ-30 Continue opens the first unfinished book', async () => {
    serve(seriesRoutes);
    renderAt('/series/s1');
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/book/b1');
  });

  it('REQ-36 says not found on a 404', async () => {
    serve({});
    renderAt('/series/nope');
    expect(await screen.findByText("We couldn't find that series")).toBeInTheDocument();
  });
});

describe('Full player (REQ-34)', () => {
  it('links the author name to their page', async () => {
    serve({
      '/api/items/li_1': {
        id: 'li_1',
        updatedAt: 1,
        media: {
          metadata: { title: 'T', authors: [{ id: 'a9', name: 'Neil Gaiman' }], narrators: [], series: [] },
          duration: 1,
          chapters: [],
        },
      },
    });
    vi.mocked(usePlayer).mockReturnValue({
      status: 'paused',
      item: { id: 'li_1', title: 'T', author: 'Neil Gaiman', coverUrl: '' },
      position: 0,
      duration: 100,
      chapters: [],
      chapterIndex: -1,
      rate: 1,
      skipBack: 10,
      skipForward: 30,
      sleep: null,
      error: null,
    } as unknown as ReturnType<typeof usePlayer> & PlayerState);
    renderAt('/now-playing');
    await userEvent.click(await screen.findByRole('button', { name: 'Neil Gaiman, open' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/author/a9');
  });
});
