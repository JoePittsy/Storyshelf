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
    if (init?.method === 'POST') {
      // The server keeps what it is sent, so a refetch finds it.
      const sent = JSON.parse(String(init.body)) as { time: number; title: string };
      list.push(bm(sent.time, sent.title));
      return Promise.resolve(sent);
    }
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
    </QueryClientProvider>
  );
  return { onClose };
}

// The sheet's own line: the toast region is a status too, but sits outside the dialog.
const sheetStatus = () => {
  const line = screen.getAllByRole('status').find((el) => el.closest('dialog'));
  if (!line) throw new Error('no status line in the sheet');
  return line;
};

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
      expect(absFetch).toHaveBeenCalledWith(
        '/api/me/item/li_1/bookmark',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ time: 900, title: 'The trolls' }) })
      )
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
      expect(absFetch).toHaveBeenCalledWith(
        '/api/me/item/li_1/bookmark',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ time: 900, title: 'Trolls' }) })
      )
    );
  });

  it('with none, says so and offers to bookmark the current second', async () => {
    serve([]);
    renderSheet();
    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bookmark 16:40' }));
    await waitFor(() =>
      expect(absFetch).toHaveBeenCalledWith(
        '/api/me/item/li_1/bookmark',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ time: 1000, title: 'Roast Mutton' }) })
      )
    );
  });

  it('with bookmarks, bookmarking here comes first, above the list, and is the sheet’s one primary action', async () => {
    serve([bm(900, 'The trolls')]);
    renderSheet();
    const list = await screen.findByRole('list', { name: 'Bookmarks, in book order' });
    const add = screen.getByRole('button', { name: 'Bookmark 16:40' });
    expect(add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.className).toMatch(/primary/);
    // Done stays at the bottom, in thumb reach, as on the other player sheets, but as a quiet pill.
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done.className).not.toMatch(/primary/);
    expect(done.className).toMatch(/ghost/);
    await userEvent.click(add);
    await waitFor(() =>
      expect(absFetch).toHaveBeenCalledWith(
        '/api/me/item/li_1/bookmark',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ time: 1000, title: 'Roast Mutton' }) })
      )
    );
  });

  it('adding the first bookmark keeps focus on the add button and says so in a standing status line', async () => {
    serve([]);
    renderSheet();
    await screen.findByText('No bookmarks yet');
    const status = sheetStatus();
    expect(status).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole('button', { name: 'Bookmark 16:40' }));
    await screen.findByRole('list', { name: 'Bookmarks, in book order' });
    // The empty state is gone, but it is the same status line, and focus is on the add button in the list's place.
    expect(sheetStatus()).toBe(status);
    expect(status).toHaveTextContent('Bookmark added at 16:40');
    expect(screen.getByRole('button', { name: 'Bookmark 16:40' })).toHaveFocus();
  });

  it('says so, and keeps focus, when the second is already bookmarked', async () => {
    serve([bm(1000, 'Roast Mutton')]);
    renderSheet();
    const add = await screen.findByRole('button', { name: 'Bookmark 16:40' });
    await userEvent.click(add);
    expect(sheetStatus()).toHaveTextContent('Already bookmarked at 16:40');
    expect(add).toHaveFocus();
    const first = sheetStatus().textContent;
    await userEvent.click(add);
    expect(sheetStatus().textContent).not.toBe(first);
  });
});
