// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { filtersStoreKey } from '../api/filters';
import { Library } from './Library';
import { NarratorRedirect } from './NarratorRedirect';

const absFetch = vi.mocked(auth.absFetch);

const book = (id: string, title: string, genres: string[] = []) => ({
  id,
  updatedAt: 1,
  media: { metadata: { title, authorName: 'Someone', genres } },
});

const FANTASY = book('1', 'Mistborn', ['Fantasy']);
const HORROR = book('2', 'It', ['Horror']);
const DONE = book('3', 'Finished fantasy', ['Fantasy']);

function mockAbs(items = [FANTASY, DONE]) {
  absFetch.mockImplementation((path: string) => {
    const u = new URL(path, 'http://x');
    if (path === '/api/libraries')
      return Promise.resolve({ libraries: [{ id: 'L1', name: 'Fiction', mediaType: 'book' }] });
    if (path === '/api/me')
      return Promise.resolve({ mediaProgress: [{ libraryItemId: '3', progress: 1, isFinished: true }] });
    if (u.pathname.endsWith('/filterdata'))
      return Promise.resolve({
        genres: ['Fantasy', 'Horror'],
        tags: [],
        languages: ['English'],
        publishers: [],
        publishedDecades: [],
      });
    if (u.pathname.endsWith('/search'))
      return Promise.resolve({
        book: [FANTASY, HORROR, DONE].map((libraryItem) => ({ libraryItem })),
        authors: [{ id: 'a1', name: 'Neil Gaiman', numBooks: 9 }],
        narrators: [{ name: 'Smith & Jones' }],
        series: [{ series: { id: 's1', name: 'The Sandman' } }],
      });
    if (u.pathname.endsWith('/items'))
      return Promise.resolve({ results: items, total: items.length, limit: 48, page: 0 });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/narrator/:name" element={<NarratorRedirect />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const itemsCalls = () => absFetch.mock.calls.map((c) => c[0]).filter((p) => p.includes('/items?'));

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

describe('REQ-37 REQ-38 REQ-41 REQ-42 filters from the URL', () => {
  it('sends the genre to ABS, applies progress here, and shows removable chips', async () => {
    mockAbs();
    renderAt('/?library=L1&genre=Fantasy&progress=hide-finished');
    expect(await screen.findByText('Mistborn')).toBeInTheDocument();
    expect(screen.queryByText('Finished fantasy')).not.toBeInTheDocument();
    const url = new URL(itemsCalls()[0] ?? '', 'http://x');
    expect(url.searchParams.get('filter')).toMatch(/^genres\./);
    expect(url.searchParams.get('progress')).toBeNull();
    expect(screen.getByText('Genre: Fantasy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Progress: Hide finished' })).toBeInTheDocument();
  });

  it('REQ-42 removing a chip drops that filter from the URL and refetches', async () => {
    mockAbs();
    renderAt('/?library=L1&genre=Fantasy&progress=hide-finished');
    await screen.findByText('Mistborn');
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Genre: Fantasy' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).not.toContain('genre='));
    expect(screen.getByTestId('where').textContent).toContain('progress=hide-finished');
    expect(screen.getByTestId('where').textContent).toContain('library=L1');
  });

  it('REQ-42 Clear all removes every filter', async () => {
    mockAbs();
    renderAt('/?library=L1&genre=Fantasy&progress=hide-finished');
    await screen.findByText('Mistborn');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).not.toMatch(/genre=|progress=/));
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('heads the grid with what it lists and how many: the server total for a lone server filter, what is loaded for a client one', async () => {
    mockAbs();
    renderAt('/?library=L1&genre=Fantasy');
    expect(await screen.findByRole('heading', { level: 2, name: 'Matching books · 2' })).toBeInTheDocument();
    cleanup();
    mockAbs();
    renderAt('/?library=L1&genre=Fantasy&progress=finished');
    await screen.findByText('Finished fantasy');
    expect(screen.getByRole('heading', { level: 2, name: 'Matching books · 1' })).toBeInTheDocument();
  });

  it('has a page heading, and an All books heading with the total when nothing is narrowed', async () => {
    mockAbs();
    renderAt('/?library=L1');
    expect(await screen.findByRole('heading', { level: 2, name: 'All books · 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    mockAbs([FANTASY]);
    renderAt('/?library=L1&genre=Fantasy&progress=finished');
    expect(await screen.findByText('No books match these filters')).toBeInTheDocument();
  });
});

describe('narrator filter', () => {
  it('redirects the old narrator route to the filtered library and shows the chip', async () => {
    mockAbs();
    renderAt('/narrator/Zo%C3%AB%20Wanamaker?library=L1');
    expect(await screen.findByRole('button', { name: 'Remove filter: Narrated by Zoë Wanamaker' })).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/?library=L1&narrator=Zo%C3%AB+Wanamaker');
    await screen.findByText('Mistborn');
    const f = new URL(itemsCalls()[0] ?? '', 'http://x').searchParams.get('filter') ?? '';
    expect(Buffer.from(decodeURIComponent(f.split('.')[1] ?? ''), 'base64').toString('utf8')).toBe('Zoë Wanamaker');
    expect(f).toMatch(/^narrators\./);
    expect(screen.getByRole('heading', { name: 'Narrated by Zoë Wanamaker · 2' })).toBeInTheDocument();
  });

  it('with Hide finished: narrator goes to ABS and progress is applied here', async () => {
    mockAbs();
    renderAt('/?library=L1&narrator=Jeff%20Hays&progress=hide-finished');
    await screen.findByText('Mistborn');
    expect(screen.queryByText('Finished fantasy')).not.toBeInTheDocument();
    expect(new URL(itemsCalls()[0] ?? '', 'http://x').searchParams.get('filter')).toMatch(/^narrators\./);
  });

  it('removing the chip clears the narrator, Clear all too, and nothing is remembered', async () => {
    mockAbs();
    renderAt('/?library=L1&narrator=Jeff%20Hays');
    await screen.findByText('Mistborn');
    expect(localStorage.getItem(filtersStoreKey('L1'))).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Narrated by Jeff Hays' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/?library=L1'));
    expect(screen.queryByRole('heading', { name: /Narrated by/ })).not.toBeInTheDocument();
  });
});

describe('REQ-39 language control', () => {
  it('is hidden in the sheet when the library has one language', async () => {
    mockAbs();
    renderAt('/?library=L1');
    await screen.findByText('Mistborn');
    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument();
  });
});

describe('REQ-43 remembered per library', () => {
  it('restores the last filters when the URL has none', async () => {
    localStorage.setItem(filtersStoreKey('L1'), 'genre=Horror');
    mockAbs();
    renderAt('/?library=L1');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('genre=Horror'));
    expect(await screen.findByText('Genre: Horror')).toBeInTheDocument();
  });

  it('prefers the URL over what was stored', async () => {
    localStorage.setItem(filtersStoreKey('L1'), 'genre=Horror');
    mockAbs();
    renderAt('/?library=L1&genre=Fantasy');
    expect(await screen.findByText('Genre: Fantasy')).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).not.toContain('Horror');
  });

  it('remembers a removal', async () => {
    localStorage.setItem(filtersStoreKey('L1'), 'genre=Fantasy');
    mockAbs();
    renderAt('/?library=L1&genre=Fantasy');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove filter: Genre: Fantasy' }));
    expect(localStorage.getItem(filtersStoreKey('L1'))).toBeNull();
  });
});

describe('REQ-44 filters narrow search results', () => {
  it('filters the merged results client-side', async () => {
    mockAbs();
    renderAt('/?library=L1&q=gaiman&genre=Fantasy');
    expect(await screen.findByText('Mistborn')).toBeInTheDocument();
    expect(screen.queryByText('It')).not.toBeInTheDocument();
  });
});

describe('REQ-32 search chips', () => {
  it('shows author, narrator and series chips above the books, linking to their pages', async () => {
    mockAbs();
    renderAt('/?library=L1&q=gaiman');
    const author = await screen.findByRole('link', { name: /Author:\s*Neil Gaiman/ });
    expect(author).toHaveAttribute('href', '/author/a1?library=L1');
    expect(screen.getByRole('link', { name: /Narrator:\s*Smith & Jones/ })).toHaveAttribute(
      'href',
      '/?library=L1&narrator=Smith+%26+Jones'
    );
    expect(screen.getByRole('link', { name: /Series:\s*The Sandman/ })).toHaveAttribute(
      'href',
      '/series/s1?library=L1'
    );
    expect(await screen.findByText('Mistborn')).toBeInTheDocument();
    expect(
      author.compareDocumentPosition(screen.getByText('Mistborn')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('drops the search text when a chip is followed, and does not write it back', async () => {
    mockAbs();
    renderAt('/?library=L1&q=gaiman');
    await userEvent.click(await screen.findByRole('link', { name: /Narrator:\s*Smith & Jones/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('narrator=Smith');
    // The box's debounce is 300 ms: wait it out, so a stale write would have landed.
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.getByTestId('where').textContent).not.toMatch(/[?&]q=/);
    expect(screen.getByRole('searchbox', { name: 'Search books' })).toHaveValue('');
  });
});
