// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));
vi.mock('../player/engine', () => ({ usePlayer: vi.fn() }));

import * as auth from '../api/auth';
import { usePlayer } from '../player/engine';
import { sortStoreKey } from '../api/sort';
import { Library } from './Library';
import { CollectionList, PlaylistList } from './BookListIndex';
import { Collection, Playlist } from './BookListDetail';

const absFetch = vi.mocked(auth.absFetch);

const book = (id: string, title: string, extra: object = {}) => ({
  id,
  mediaType: 'book',
  updatedAt: 1,
  media: { duration: 3600, metadata: { title, authorName: 'Someone' } },
  ...extra,
});
const B1 = book('b1', 'Velveteen');
const B2 = book('b2', 'Copper Beeches');
const B3 = book('b3', 'Peter Rabbit');

const COLLECTION = { id: 'c1', libraryId: 'L1', name: 'Bedtime stories', description: 'Short ones.', books: [B3, B1, B2] };
const PLAYLIST = {
  id: 'p1',
  libraryId: 'L1',
  name: 'Road trip',
  description: null,
  items: [
    { libraryItemId: 'b2', episodeId: null, libraryItem: B2 },
    { libraryItemId: 'pod', episodeId: 'e1', libraryItem: book('pod', 'A show', { mediaType: 'podcast' }) },
    { libraryItemId: 'b1', episodeId: null, libraryItem: B1 },
  ],
};

interface Setup {
  collections?: unknown[];
  playlists?: unknown[];
  progress?: object[];
}

/** Serves ABS by path; anything unlisted is a 404. */
function mockAbs({ collections = [], playlists = [], progress = [] }: Setup = {}) {
  absFetch.mockImplementation((path: string) => {
    const u = new URL(path, 'http://x');
    const page = <T,>(all: T[]) => {
      const limit = Number(u.searchParams.get('limit') ?? 0);
      const p = Number(u.searchParams.get('page') ?? 0);
      return { results: limit ? all.slice(p * limit, p * limit + limit) : all, total: all.length, limit, page: p };
    };
    if (path === '/api/libraries') return Promise.resolve({ libraries: [{ id: 'L1', name: 'Fiction', mediaType: 'book' }] });
    if (path === '/api/me') return Promise.resolve({ mediaProgress: progress });
    if (u.pathname === '/api/libraries/L1/collections') return Promise.resolve(page(collections));
    if (u.pathname === '/api/libraries/L1/playlists') return Promise.resolve(page(playlists));
    if (u.pathname === '/api/collections/c1') return Promise.resolve(COLLECTION);
    if (u.pathname === '/api/playlists/p1') return Promise.resolve(PLAYLIST);
    if (u.pathname.endsWith('/filterdata'))
      return Promise.resolve({ genres: [], tags: [], languages: [], publishers: [], publishedDecades: [] });
    if (u.pathname.endsWith('/items')) return Promise.resolve({ results: [B1, B2], total: 2, limit: 48, page: 0 });
    return Promise.reject(new auth.AbsError(404, 'Not Found'));
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
          <Route path="/" element={<Library />} />
          <Route path="/collections" element={<CollectionList />} />
          <Route path="/playlists" element={<PlaylistList />} />
          <Route path="/collection/:id" element={<Collection onPlay={onPlay} />} />
          <Route path="/playlist/:id" element={<Playlist onPlay={onPlay} />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onPlay;
}

const itemsCalls = () => absFetch.mock.calls.map((c) => c[0]).filter((p) => p.includes('/items?'));

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(usePlayer).mockReturnValue({ item: null, status: 'idle', toggle: vi.fn() } as unknown as ReturnType<
    typeof usePlayer
  >);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Library sections: Books, Collections, Playlists', () => {
  it('has no section row when the library has no collections or playlists', async () => {
    mockAbs();
    renderAt('/?library=L1');
    await screen.findByText('Velveteen');
    expect(screen.queryByRole('navigation', { name: 'Library sections' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Collections' })).not.toBeInTheDocument();
  });

  it('offers Collections (and not Playlists) when only collections exist, keeping the library', async () => {
    mockAbs({ collections: [COLLECTION] });
    renderAt('/?library=L1');
    const nav = await screen.findByRole('navigation', { name: 'Library sections' });
    expect(within(nav).getByRole('link', { name: 'Books' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Collections' })).toHaveAttribute('href', '/collections?library=L1');
    expect(within(nav).queryByRole('link', { name: 'Playlists' })).not.toBeInTheDocument();
  });

  it('asks ABS for one of each only, to know whether they exist', async () => {
    mockAbs({ collections: [COLLECTION], playlists: [PLAYLIST] });
    renderAt('/?library=L1');
    await screen.findByRole('link', { name: 'Playlists' });
    const counted = absFetch.mock.calls.map((c) => c[0]).filter((p) => /\/(collections|playlists)\?/.test(p));
    for (const p of counted) expect(new URL(p, 'http://x').searchParams.get('limit')).toBe('1');
  });
});

describe('Library sort', () => {
  it('offers the new sorts and puts the choice in the URL, remembered for the library', async () => {
    mockAbs();
    renderAt('/?library=L1');
    await screen.findByText('Velveteen');
    const select = screen.getByRole('combobox', { name: 'Sort by' });
    expect(within(select).getByRole('option', { name: 'Longest' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Title Z–A' })).toBeInTheDocument();
    await userEvent.selectOptions(select, 'Longest');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('sort=media.duration&desc=1'));
    expect(localStorage.getItem(sortStoreKey('L1'))).toBe('sort=media.duration&desc=1');
    await waitFor(() => expect(itemsCalls()[itemsCalls().length - 1]).toMatch(/sort=media\.duration&desc=1/));
  });

  it('brings back the library’s last sort when the URL has none, asking ABS for it straight away', async () => {
    localStorage.setItem(sortStoreKey('L1'), 'sort=media.metadata.title&desc=1');
    mockAbs();
    renderAt('/?library=L1');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('sort=media.metadata.title&desc=1'));
    await screen.findByText('Velveteen');
    expect(itemsCalls().every((p) => p.includes('sort=media.metadata.title&desc=1'))).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveDisplayValue('Title Z–A');
  });

  it('restores remembered filters and sort together', async () => {
    localStorage.setItem(sortStoreKey('L1'), 'sort=media.duration');
    localStorage.setItem('storyshelf.filters.L1', 'genre=Horror');
    mockAbs();
    renderAt('/?library=L1');
    await waitFor(() => {
      const where = screen.getByTestId('where').textContent ?? '';
      expect(where).toContain('genre=Horror');
      expect(where).toContain('sort=media.duration');
    });
  });

  it('a sort in the URL wins over the remembered one', async () => {
    localStorage.setItem(sortStoreKey('L1'), 'sort=media.duration');
    mockAbs();
    renderAt('/?library=L1&sort=progress');
    await screen.findByText('Velveteen');
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveDisplayValue('Recently listened');
    expect(itemsCalls().every((p) => p.includes('sort=progress&desc=1'))).toBe(true);
  });
});

describe('Collections list', () => {
  it('lists the library’s collections with their book counts, linking to each', async () => {
    mockAbs({ collections: [COLLECTION] });
    renderAt('/collections?library=L1');
    const tile = await screen.findByRole('link', { name: /Bedtime stories/ });
    expect(tile).toHaveAttribute('href', '/collection/c1?library=L1');
    expect(tile).toHaveTextContent('3 books');
    const nav = screen.getByRole('navigation', { name: 'Library sections' });
    expect(within(nav).getByRole('link', { name: 'Collections' })).toHaveAttribute('aria-current', 'page');
  });

  it('says so when there are none, with the tabs still there to go back', async () => {
    mockAbs();
    renderAt('/collections?library=L1');
    expect(await screen.findByText('No collections in this library')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Books' })).toHaveAttribute('href', '/?library=L1');
  });
});

describe('Playlists list', () => {
  it('lists the listener’s playlists, counting books only', async () => {
    mockAbs({ playlists: [PLAYLIST] });
    renderAt('/playlists?library=L1');
    const tile = await screen.findByRole('link', { name: /Road trip/ });
    expect(tile).toHaveAttribute('href', '/playlist/p1?library=L1');
    expect(tile).toHaveTextContent('2 books');
  });
});

describe('Collection page', () => {
  const progress = [
    { libraryItemId: 'b3', progress: 1, isFinished: true, currentTime: 3600 },
    { libraryItemId: 'b2', progress: 0.25, isFinished: false, currentTime: 900 },
  ];

  it('shows its name, description and books in collection order, with progress and links to each book', async () => {
    mockAbs({ progress });
    renderAt('/collection/c1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bedtime stories' })).toBeInTheDocument();
    expect(screen.getByText('Short ones.')).toBeInTheDocument();
    expect(screen.getByText('3 books')).toBeInTheDocument();
    const links = (await screen.findAllByRole('link')).filter((l) => l.getAttribute('href')?.startsWith('/book/'));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/book/b3', '/book/b1', '/book/b2']);
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Progress through Copper Beeches', hidden: true })).toHaveAttribute(
        'aria-valuenow',
        '25',
      ),
    );
  });

  it('Play starts the first unfinished book, from the top', async () => {
    mockAbs({ progress });
    const onPlay = renderAt('/collection/c1');
    await userEvent.click(await screen.findByRole('button', { name: 'Play: Velveteen' }));
    expect(onPlay).toHaveBeenCalledWith('b1', 0);
    expect(screen.getByTestId('where')).toHaveTextContent('/collection/c1');
  });

  it('each book has its own play button, which carries on from the server’s place', async () => {
    mockAbs({ progress });
    const onPlay = renderAt('/collection/c1');
    await userEvent.click(await screen.findByRole('button', { name: 'Play Copper Beeches' }));
    expect(onPlay).toHaveBeenCalledWith('b2'); // no start named: the player carries on from the server's place
  });

  it('says Pause while the book Play would start is playing, and pauses it', async () => {
    mockAbs({ progress });
    const toggle = vi.fn();
    vi.mocked(usePlayer).mockReturnValue({ item: { id: 'b1' }, status: 'playing', toggle } as unknown as ReturnType<
      typeof usePlayer
    >);
    const onPlay = renderAt('/collection/c1');
    await userEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('says not found for a missing collection', async () => {
    mockAbs();
    renderAt('/collection/nope');
    expect(await screen.findByText("We couldn't find that collection")).toBeInTheDocument();
  });
});

describe('Playlist page', () => {
  it('shows only the books, in playlist order, and says the rest are not shown', async () => {
    mockAbs();
    renderAt('/playlist/p1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Road trip' })).toBeInTheDocument();
    const links = (await screen.findAllByRole('link')).filter((l) => l.getAttribute('href')?.startsWith('/book/'));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/book/b2', '/book/b1']);
    expect(screen.queryByText('A show')).not.toBeInTheDocument();
    expect(screen.getByText('2 books · 1 podcast episode not shown')).toBeInTheDocument();
  });

  it('Play continues a book already begun', async () => {
    mockAbs({ progress: [{ libraryItemId: 'b2', progress: 0.5, isFinished: false, currentTime: 1800 }] });
    const onPlay = renderAt('/playlist/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Continue · 30m left: Copper Beeches' }));
    expect(onPlay).toHaveBeenCalledWith('b2', undefined);
  });
});
