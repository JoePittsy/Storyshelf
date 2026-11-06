// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@joepittsy/ui';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));
vi.mock('./engine', () => ({ usePlayer: vi.fn() }));

import * as auth from '../api/auth';
import * as engine from './engine';
import type { Bookmark } from '../api/bookmarks';
import { BookmarksSheet } from './BookmarksSheet';

const absFetch = vi.mocked(auth.absFetch);
const seek = vi.fn();
const chapters = [
  { id: 0, start: 0, end: 600, title: 'An Unexpected Party' },
  { id: 1, start: 600, end: 1200, title: 'Roast Mutton' },
];
const bm = (time: number, title: string): Bookmark => ({ libraryItemId: 'li_1', time, title, createdAt: 1 });

function serve(list: Bookmark[]) {
  absFetch.mockImplementation((path, init) => {
    if (path === '/api/me') return Promise.resolve({ bookmarks: list });
    if (init?.method === 'POST') return Promise.resolve(JSON.parse(String(init.body)));
    return Promise.resolve(undefined);
  });
}

function renderSheet(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BookmarksSheet open onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  // jsdom has <dialog> but not its modal methods.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  vi.mocked(engine.usePlayer).mockReturnValue({
    item: { id: 'li_1', title: 'The Hobbit', author: 'Tolkien', coverUrl: '' },
    position: 1000.6,
    chapters,
    status: 'paused',
    seek,
  } as unknown as ReturnType<typeof engine.usePlayer>);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('BookmarksSheet', () => {
  it('lists the book’s bookmarks in time order, each with its chapter and time', async () => {
    serve([bm(900, 'The trolls'), bm(30, 'An Unexpected Party')]);
    renderSheet();
    const list = await screen.findByRole('list', { name: 'Bookmarks, in book order' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('An Unexpected Party');
    expect(rows[0]).toHaveTextContent('Chapter 1');
    expect(rows[0]).toHaveTextContent('0:00:30');
    expect(rows[1]).toHaveTextContent('The trolls');
    expect(rows[1]).toHaveTextContent('Roast Mutton');
    expect(rows[1]).toHaveTextContent('0:15:00');
  });

  it('a row jumps there and closes the sheet', async () => {
    serve([bm(900, 'The trolls')]);
    const { onClose } = renderSheet();
    await userEvent.click(await screen.findByRole('button', { name: /^The trolls/ }));
    expect(seek).toHaveBeenCalledWith(900);
    expect(onClose).toHaveBeenCalled();
  });

  it('delete leaves an Undo in its place, which puts the bookmark back as it was', async () => {
    serve([bm(900, 'The trolls')]);
    renderSheet();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete The trolls' }));
    expect(absFetch).toHaveBeenCalledWith('/api/me/item/li_1/bookmark/900', { method: 'DELETE' });
    expect(screen.getByText('Deleted “The trolls”')).toBeInTheDocument();
    const undo = screen.getByRole('button', { name: 'Undo deleting The trolls' });
    await waitFor(() => expect(undo).toHaveFocus());
    await userEvent.click(undo);
    await waitFor(() =>
      expect(absFetch).toHaveBeenCalledWith('/api/me/item/li_1/bookmark', expect.objectContaining({ method: 'POST', body: JSON.stringify({ time: 900, title: 'The trolls' }) })),
    );
  });

  it('renames through a small dialog', async () => {
    serve([bm(900, 'Roast Mutton')]);
    renderSheet();
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Roast Mutton' }));
    const field = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Trolls{Enter}');
    await waitFor(() =>
      expect(absFetch).toHaveBeenCalledWith('/api/me/item/li_1/bookmark', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ time: 900, title: 'Trolls' }) })),
    );
  });

  it('with none, says so and offers to bookmark the current second', async () => {
    serve([]);
    renderSheet();
    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bookmark 16:40' }));
    await waitFor(() =>
      expect(absFetch).toHaveBeenCalledWith('/api/me/item/li_1/bookmark', expect.objectContaining({ method: 'POST', body: JSON.stringify({ time: 1000, title: 'Roast Mutton' }) })),
    );
  });
});
