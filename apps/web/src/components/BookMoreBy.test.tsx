// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import type { BookItem } from '../api/items';
import { BookMoreBy } from './BookMoreBy';

const absFetch = vi.mocked(auth.absFetch);

const DOYLE = { id: 'doyle', name: 'Arthur Conan Doyle' };
const SERIES = { id: 'sh', name: 'Sherlock Holmes' };
const NARRATOR = 'Phil Chenevert';

const item = (id: string, title: string, authorName = DOYLE.name, sequence?: string) => ({
  id,
  updatedAt: 1,
  libraryId: 'L1',
  media: {
    duration: 3000,
    metadata: { title, authorName, narratorName: NARRATOR, ...(sequence ? { series: { ...SERIES, sequence } } : {}) },
  },
});
const BLUE = item('b1', 'The Adventure of the Blue Carbuncle', DOYLE.name, '1');
const COPPER = item('b2', 'The Adventure of the Copper Beeches', DOYLE.name, '2');
const HOUND = item('h', 'The Hound of the Baskervilles');
const EMMA = item('e', 'Emma', 'Jane Austen');

const bookOf = (it: typeof BLUE, sequence: string): BookItem => ({
  id: it.id,
  libraryId: 'L1',
  updatedAt: 1,
  media: {
    duration: 3000,
    chapters: [],
    metadata: {
      title: it.media.metadata.title,
      subtitle: null,
      authors: [DOYLE],
      narrators: [NARRATOR],
      series: [{ ...SERIES, sequence }],
      description: null,
      publishedYear: null,
    },
  },
});

/** ABS: Doyle's books, the narrator's books and the series, with `finished` done. */
function serve({ authorBooks, narrated, finished }: { authorBooks: object[]; narrated: object[]; finished: string[] }) {
  absFetch.mockImplementation((path: string) => {
    const u = new URL(path, 'http://x');
    const filter = decodeURIComponent(u.searchParams.get('filter') ?? '');
    if (path === '/api/me')
      return Promise.resolve({
        mediaProgress: finished.map((id) => ({ libraryItemId: id, progress: 1, isFinished: true })),
      });
    if (u.pathname.startsWith('/api/items/')) {
      const id = u.pathname.split('/')[3];
      return Promise.resolve(id === 'b1' ? bookOf(BLUE, '1') : bookOf(COPPER, '2'));
    }
    if (u.pathname === '/api/authors/doyle')
      return Promise.resolve({
        ...DOYLE,
        libraryItems: authorBooks,
        series: [{ ...SERIES, items: [BLUE, COPPER] }],
      });
    if (u.pathname === '/api/libraries/L1/items' && filter.startsWith('series.'))
      return Promise.resolve({ results: [BLUE, COPPER] });
    if (u.pathname === '/api/libraries/L1/items' && filter.startsWith('narrators.'))
      return Promise.resolve({ results: narrated, total: narrated.length, limit: 48, page: 0 });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderMoreBy(book: BookItem, progress: number, isFinished: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BookMoreBy book={book} progress={progress} isFinished={isFinished} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const shelf = (name: string) => screen.getByRole('heading', { name }).parentElement?.parentElement as HTMLElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BookMoreBy', () => {
  it('after the last book of a series, offers the earlier one still unheard, and no narrator row that adds nothing', async () => {
    serve({ authorBooks: [BLUE, COPPER], narrated: [BLUE, COPPER], finished: ['b2'] });
    renderMoreBy(bookOf(COPPER, '2'), 1, true);
    expect(await screen.findByRole('heading', { name: 'More by Arthur Conan Doyle' })).toBeInTheDocument();
    const row = shelf('More by Arthur Conan Doyle');
    expect(within(row).getByRole('link', { name: /The Adventure of the Blue Carbuncle/ })).toBeInTheDocument();
    expect(within(row).getByText('Book 1 of Sherlock Holmes')).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: /Copper Beeches/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Also narrated by/ })).not.toBeInTheDocument();
  });

  it('leaves the series to the Next in series card, and adds the narrator row for other authors', async () => {
    serve({ authorBooks: [BLUE, COPPER, HOUND], narrated: [BLUE, COPPER, EMMA], finished: ['b1'] });
    renderMoreBy(bookOf(BLUE, '1'), 1, true);
    await screen.findByRole('heading', { name: 'More by Arthur Conan Doyle' });
    const author = shelf('More by Arthur Conan Doyle');
    expect(
      within(author)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual(['/book/h']);
    const narrator = shelf(`Also narrated by ${NARRATOR}`);
    expect(
      within(narrator)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
    ).toEqual(['/book/e']);
    expect(within(narrator).getByText('Jane Austen')).toBeInTheDocument();
  });

  it('shows for a book three quarters through, before it is finished', async () => {
    serve({ authorBooks: [BLUE, COPPER, HOUND], narrated: [], finished: [] });
    renderMoreBy(bookOf(BLUE, '1'), 0.8, false);
    await screen.findByRole('heading', { name: 'More by Arthur Conan Doyle' });
    expect(within(shelf('More by Arthur Conan Doyle')).getAllByRole('link')).toHaveLength(2);
  });

  it('stays out of the way, asking ABS for nothing, until the listener is well into the book', async () => {
    serve({ authorBooks: [BLUE, COPPER, HOUND], narrated: [EMMA], finished: [] });
    const view = renderMoreBy(bookOf(BLUE, '1'), 0.5, false);
    await new Promise((r) => setTimeout(r, 20));
    expect(view.container).toBeEmptyDOMElement();
    expect(absFetch.mock.calls.map(([p]) => p).filter((p) => p !== '/api/me')).toEqual([]);
  });

  it('is hidden when everything else by them is finished', async () => {
    serve({ authorBooks: [BLUE, COPPER], narrated: [BLUE, COPPER], finished: ['b1', 'b2'] });
    const view = renderMoreBy(bookOf(COPPER, '2'), 1, true);
    await waitFor(() => expect(absFetch).toHaveBeenCalledWith(expect.stringContaining('/api/authors/doyle')));
    await new Promise((r) => setTimeout(r, 20));
    expect(view.container).toBeEmptyDOMElement();
  });
});
