// @vitest-environment jsdom
// The Book screen's progress actions: Mark as finished / not finished, Remove from Continue listening and Reset progress,
// behind More, each with Undo.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { Book } from './Book';

const absFetch = vi.mocked(auth.absFetch);

const record = {
  id: 'mp_1',
  libraryItemId: 'li_1',
  duration: 36000,
  currentTime: 3730,
  progress: 0.1,
  isFinished: false,
  hideFromContinueListening: false,
  lastUpdate: 2000,
  startedAt: 1000,
  finishedAt: null as number | null,
};

const book = (progress: typeof record | null) => ({
  id: 'li_1',
  updatedAt: 1,
  media: {
    metadata: {
      title: 'The Hobbit',
      subtitle: null,
      authors: [],
      narrators: [],
      series: [],
      description: null,
      publishedYear: null,
    },
    duration: 36000,
    chapters: [],
  },
  userMediaProgress: progress,
});

let calls: { method: string; url: string; body?: unknown }[] = [];

/** Serves the book with `progress`, and records every write. */
function serve(progress: typeof record | null, fail = false) {
  calls = [];
  absFetch.mockImplementation((url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(init.body as string) : undefined });
    if (method !== 'GET') return fail ? Promise.reject(new TypeError('offline')) : Promise.resolve(undefined);
    if (url === '/api/me/progress/li_1')
      return progress ? Promise.resolve(progress) : Promise.reject(new auth.AbsError(404, 'Not Found'));
    if (url.startsWith('/api/me/item/listening-sessions'))
      return Promise.resolve({ sessions: [], total: 0, numPages: 0, page: 0, itemsPerPage: 100 });
    if (url === '/api/me/listening-stats') return Promise.resolve({ totalTime: 0, days: {}, today: 0, items: {} });
    return Promise.resolve(book(progress));
  });
}

const writes = () =>
  calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url} ${JSON.stringify(c.body ?? null)}`);

function renderBook() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/book/li_1']}>
          <Routes>
            <Route path="/book/:id" element={<Book />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const menuItems = async () => {
  await screen.findByRole('heading', { level: 1, name: 'The Hobbit' });
  expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  const panel = document.getElementById(
    screen.getByRole('button', { name: 'More actions' }).getAttribute('popovertarget') ?? ''
  );
  return [...(panel?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
};
const choose = (name: string) => userEvent.click(screen.getByRole('button', { name, hidden: true }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Book screen progress actions', () => {
  it('an unstarted book offers Mark as finished only', async () => {
    serve(null);
    renderBook();
    expect(await menuItems()).toEqual(['Mark as finished']);
  });

  it('a started book offers Mark as finished, Remove from Continue listening and Reset progress', async () => {
    serve(record);
    renderBook();
    expect(await menuItems()).toEqual(['Mark as finished', 'Remove from Continue listening', 'Reset progress']);
  });

  it('a started book already off Continue listening does not offer to remove it again', async () => {
    serve({ ...record, hideFromContinueListening: true });
    renderBook();
    expect(await menuItems()).toEqual(['Mark as finished', 'Reset progress']);
  });

  it('a finished book offers Mark as not finished and Reset progress', async () => {
    serve({ ...record, isFinished: true, progress: 1, finishedAt: 3000 });
    renderBook();
    expect(await menuItems()).toEqual(['Mark as not finished', 'Reset progress']);
  });

  it('Mark as finished PATCHes the book, refreshes it, and Undo puts the place and update time back', async () => {
    serve(record);
    renderBook();
    await menuItems();
    const itemFetches = () => calls.filter((c) => c.url.startsWith('/api/items/li_1')).length;
    const before = itemFetches();
    await choose('Mark as finished');
    expect(await screen.findByText('Marked as finished')).toBeInTheDocument();
    expect(writes()).toEqual(['PATCH /api/me/progress/li_1 {"isFinished":true}']);
    await waitFor(() => expect(itemFetches()).toBeGreaterThan(before));

    // The server now has it finished; Undo un-finishes it and puts the place back.
    serve({ ...record, isFinished: true, progress: 1, finishedAt: 3000 });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        'PATCH /api/me/progress/li_1 {"isFinished":false}',
        'PATCH /api/me/progress/li_1 {"currentTime":3730,"duration":36000,"progress":0.1,"markAsFinishedTimeRemaining":0,"hideFromContinueListening":false,"lastUpdate":2000}',
      ])
    );
  });

  it('Reset progress deletes the progress record, and Undo recreates it with its started time', async () => {
    serve(record);
    renderBook();
    await menuItems();
    await choose('Reset progress');
    expect(await screen.findByText('Progress reset from 1:02:10')).toBeInTheDocument();
    expect(writes()).toEqual(['DELETE /api/me/progress/mp_1 null']);

    serve(null);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
      {
        currentTime: 3730,
        duration: 36000,
        progress: 0.1,
        markAsFinishedTimeRemaining: 0,
        isFinished: false,
        finishedAt: null,
        hideFromContinueListening: false,
        createdAt: 1000,
      },
      { lastUpdate: 2000, markAsFinishedTimeRemaining: 0 },
    ]);
  });

  it('Remove from Continue listening hides the progress record, and Undo shows it again with its update time', async () => {
    serve(record);
    renderBook();
    await menuItems();
    await choose('Remove from Continue listening');
    expect(await screen.findByText('Removed from Continue listening')).toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toContain(
      'GET /api/me/progress/mp_1/remove-from-continue-listening'
    );
    expect(writes()).toEqual([]);

    serve({ ...record, hideFromContinueListening: true, lastUpdate: 4000 });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        'PATCH /api/me/progress/li_1 {"currentTime":3730,"duration":36000,"progress":0.1,"markAsFinishedTimeRemaining":0,"hideFromContinueListening":false,"lastUpdate":2000}',
      ])
    );
  });

  it('says so when the server cannot be reached, with no Undo', async () => {
    serve(record, true);
    renderBook();
    await menuItems();
    await choose('Mark as finished');
    expect(await screen.findByText(/Couldn't mark this book as finished/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
