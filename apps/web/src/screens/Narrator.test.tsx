// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { narratorPath } from '../api/libraries';
import { Narrator } from './Narrator';

const absFetch = vi.mocked(auth.absFetch);
const book = (id: string, title: string) => ({
  id,
  updatedAt: 1,
  media: { metadata: { title, authorName: 'Someone' } },
});

function mockAbs(books: ReturnType<typeof book>[]) {
  absFetch.mockImplementation((path: string) => {
    if (path === '/api/libraries') return Promise.resolve({ libraries: [{ id: 'L1', name: 'Fiction', mediaType: 'book' }] });
    if (path === '/api/me') return Promise.resolve({ mediaProgress: [] });
    if (path.includes('/items?')) return Promise.resolve({ results: books });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderAt(name: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`${narratorPath(name)}?library=L1`]}>
        <Routes>
          <Route path="/narrator/:name" element={<Narrator />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('REQ-29 narrator page', () => {
  it('shows the name, the book count and the books', async () => {
    mockAbs([book('1', 'Dune'), book('2', 'Emma')]);
    renderAt('Jeff Hays');
    expect(await screen.findByRole('heading', { name: 'Jeff Hays' })).toBeInTheDocument();
    expect(await screen.findByText('2 books')).toBeInTheDocument();
    expect(screen.getByText('Dune')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Emma/ })).toHaveAttribute('href', '/book/2');
  });
});

describe('REQ-36 narrator edge cases', () => {
  it.each(['Zoë Wanamaker', 'Smith & Jones', 'A/B #1'])('opens %s and asks ABS for that exact name', async (name) => {
    mockAbs([book('1', 'Dune')]);
    renderAt(name);
    expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
    await screen.findByText('Dune'); // the books request has been made by now
    const url = absFetch.mock.calls.map((c) => c[0]).find((p) => p.includes('/items?')) ?? '';
    const enc = new URL(url, 'http://x').searchParams.get('filter')?.split('.')[1] ?? '';
    expect(Buffer.from(decodeURIComponent(enc), 'base64').toString('utf8')).toBe(name);
  });

  it('says not found when the narrator has no books here', async () => {
    mockAbs([]);
    renderAt('Nobody Known');
    expect(await screen.findByText('Not found')).toBeInTheDocument();
    expect(screen.getByText(/couldn't find any books narrated by Nobody Known in this library/)).toBeInTheDocument();
    expect(screen.queryByText(/books?$/)).not.toBeInTheDocument();
  });
});
