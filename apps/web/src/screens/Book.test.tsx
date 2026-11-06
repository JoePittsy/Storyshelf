// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { Book } from './Book';

const absFetch = vi.mocked(auth.absFetch);

/** The book, and an empty listening history for the "Your listening" section. */
const serve = (book: unknown) =>
  absFetch.mockImplementation((path: string) => {
    if (path.startsWith('/api/me/item/listening-sessions'))
      return Promise.resolve({ sessions: [], total: 0, numPages: 0, page: 0, itemsPerPage: 100 });
    if (path === '/api/me/listening-stats') return Promise.resolve({ totalTime: 0, days: {}, today: 0, items: {} });
    return Promise.resolve(book);
  });

const item = {
  id: 'li_1',
  updatedAt: 1,
  media: {
    metadata: {
      title: 'The Hobbit',
      subtitle: null,
      authors: [{ id: 'a', name: 'J. R. R. Tolkien' }],
      narrators: ['Rob Inglis'],
      series: [],
      description: '<p>There and back again.</p><script>alert(1)</script>',
      publishedYear: '1937',
    },
    duration: 36000,
    chapters: [
      { id: 0, start: 0, end: 3600, title: 'An Unexpected Party' },
      { id: 1, start: 3600, end: 7200, title: 'Roast Mutton' },
    ],
  },
  userMediaProgress: { currentTime: 3730, progress: 0.1, isFinished: false },
};

function renderBook(onPlay = vi.fn(), onChapter = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/book/li_1']}>
        <Routes>
          <Route path="/book/:id" element={<Book onPlay={onPlay} onChapter={onChapter} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onPlay, onChapter };
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Book screen', () => {
  it('REQ-13/14 shows details, time left and a Resume button', async () => {
    serve(item);
    const { onPlay } = renderBook();
    expect(await screen.findByRole('heading', { level: 1, name: 'The Hobbit' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Rob Inglis, open' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Chapter 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('There and back again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume · 8h 57m left' }));
    expect(onPlay).toHaveBeenCalledWith(3730);
  });

  it('REQ-15 marks the current chapter and selecting one reports its start', async () => {
    serve(item);
    const { onChapter } = renderBook();
    const current = await screen.findByRole('button', { name: /Roast Mutton/ });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /An Unexpected Party/ })).not.toHaveAttribute('aria-current');
    await userEvent.click(screen.getByRole('button', { name: /An Unexpected Party/ }));
    expect(onChapter).toHaveBeenCalledWith(0);
  });

  it('shows a friendly empty state on 404', async () => {
    absFetch.mockRejectedValue(new auth.AbsError(404, 'Not Found'));
    renderBook();
    expect(await screen.findByText("This book isn't in your library")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to your library' })).toHaveAttribute('href', '/');
  });

  it('offers a retry on other errors', async () => {
    absFetch.mockRejectedValue(new auth.AbsError(500, 'boom'));
    renderBook();
    // The hook retries twice (1s, 2s backoff) before giving up.
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 })).toBeInTheDocument();
  }, 10000);

  it('REQ-31/REQ-36 links author, narrator and series names to their pages, encoding the narrator', async () => {
    serve({
      ...item,
      media: {
        ...item.media,
        metadata: {
          ...item.media.metadata,
          authors: [{ id: 'au 1', name: 'Neil Gaiman' }],
          narrators: ['Zoë Wanamaker'],
          series: [{ id: 'se_1', name: 'The Sandman', sequence: '1' }],
        },
      },
    });
    const at = (to: string) => () => <p>{`${to}: ${decodeURIComponent(useLocation().pathname + useLocation().search)}`}</p>;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderAt = () =>
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/book/li_1']}>
            <Routes>
              <Route path="/book/:id" element={<Book />} />
              <Route path="/author/:id" element={React.createElement(at('author'))} />
              <Route path="/" element={React.createElement(at('narrator'))} />
              <Route path="/series/:id" element={React.createElement(at('series'))} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    for (const [name, expected] of [
      ['Neil Gaiman, open', 'author: /author/au 1'],
      ['Zoë Wanamaker, open', 'narrator: /?narrator=Zoë+Wanamaker'],
      ['The Sandman, open', 'series: /series/se_1'],
    ] as const) {
      cleanup();
      renderAt();
      // The hero and the Details list both carry the link.
      const links = await screen.findAllByRole('button', { name });
      expect(links).toHaveLength(2);
      await userEvent.click(links[0] as HTMLElement);
      expect(await screen.findByText(new RegExp(`^${expected}`.replace(/[?+]/g, '\\$&')))).toBeInTheDocument();
    }
    expect(encodeURIComponent('Zoë Wanamaker')).toBe('Zo%C3%AB%20Wanamaker');
  });

  it('puts the chapters straight after the hero, before the description', async () => {
    serve(item);
    renderBook();
    const chapters = await screen.findByRole('heading', { name: 'Chapters' });
    const about = screen.getByRole('heading', { name: 'About this book' });
    expect(chapters.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('drops a chapter number that repeats its position, and hides the number column from assistive tech', async () => {
    serve({
      ...item,
      media: { ...item.media, chapters: [{ id: 0, start: 0, end: 3600, title: '01 - An Unexpected Party' }, { id: 1, start: 3600, end: 7200, title: '07 - Seven' }] },
    });
    renderBook();
    const first = await screen.findByRole('button', { name: /An Unexpected Party/ });
    expect(first).toHaveTextContent('An Unexpected Party');
    expect(first).not.toHaveTextContent('01 -');
    expect(first.querySelector('[aria-hidden="true"]')).toHaveTextContent('1');
    // A number that is not its position is part of the name.
    expect(screen.getByRole('button', { name: /07 - Seven/ })).toBeInTheDocument();
  });

  it('shows a description that is only a link as its source', async () => {
    serve({ ...item, media: { ...item.media, metadata: { ...item.media.metadata, description: 'https://www.archive.org/details/hobbit' } } });
    renderBook();
    const link = await screen.findByRole('link', { name: 'archive.org' });
    expect(link).toHaveAttribute('href', 'https://www.archive.org/details/hobbit');
    expect(screen.queryByRole('heading', { name: 'About this book' })).not.toBeInTheDocument();
  });
});
