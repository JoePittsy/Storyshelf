// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import type { Bookmark } from '../api/bookmarks';
import type { BookItem } from '../api/items';
import { BookBookmarks, FIRST_BOOKMARKS } from './BookBookmarks';

const absFetch = vi.mocked(auth.absFetch);
const item = {
  id: 'li_1',
  media: { chapters: [{ id: 0, start: 0, end: 3600, title: 'An Unexpected Party' }] },
} as unknown as BookItem;
const bm = (time: number, title: string, libraryItemId = 'li_1'): Bookmark => ({ libraryItemId, time, title, createdAt: 1 });

function renderSection(list: Bookmark[], onOpen = vi.fn()) {
  absFetch.mockResolvedValue({ bookmarks: list });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <BookBookmarks item={item} onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { onOpen, ...view };
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('BookBookmarks', () => {
  it("lists this book's bookmarks in book order, and a tap opens one", async () => {
    const { onOpen } = renderSection([bm(120, 'Later'), bm(60, 'Sooner'), bm(5, 'Other book', 'li_2')]);
    const list = await screen.findByRole('list', { name: 'Bookmarks, in book order' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Sooner'),
      expect.stringContaining('Later'),
    ]);
    expect(rows[0]).toHaveTextContent('0:01:00');
    await userEvent.click(rows[1] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ time: 120, title: 'Later' }));
  });

  it('shows nothing for a book without bookmarks', async () => {
    const { container } = renderSection([bm(5, 'Other book', 'li_2')]);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps a long list compact until asked', async () => {
    const many = Array.from({ length: FIRST_BOOKMARKS + 2 }, (_, i) => bm(i * 10, `Mark ${i + 1}`));
    renderSection(many);
    const list = await screen.findByRole('list', { name: 'Bookmarks, in book order' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(FIRST_BOOKMARKS);
    await userEvent.click(screen.getByRole('button', { name: `Show all ${many.length} bookmarks` }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(many.length);
  });
});
