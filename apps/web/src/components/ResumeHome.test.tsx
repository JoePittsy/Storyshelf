// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { ResumeHome } from './ResumeHome';

const absFetch = vi.mocked(auth.absFetch);

const book = (id: string, title: string, series?: { name: string; sequence: string }) => ({
  id,
  updatedAt: 1,
  libraryId: 'L1',
  mediaType: 'book',
  progressLastUpdate: 1,
  media: { duration: 3600, metadata: { title, authorName: 'Arthur Conan Doyle', series: series && { id: 'S', ...series } } },
});

const COPPER = book('b2', 'The Adventure of the Copper Beeches', { name: 'Sherlock Holmes', sequence: '2' });
const RABBIT = book('r', 'The Velveteen Rabbit');

function serve({ inProgress, series }: { inProgress: object[]; series: object[] }) {
  absFetch.mockImplementation((path: string) => {
    const u = new URL(path, 'http://x');
    if (path === '/api/me')
      return Promise.resolve({
        mediaProgress: (inProgress as { id: string }[]).map((b) => ({ libraryItemId: b.id, progress: 0.3, isFinished: false })),
      });
    if (u.pathname === '/api/me/items-in-progress') return Promise.resolve({ libraryItems: inProgress });
    if (u.pathname === '/api/libraries/L1/personalized')
      return Promise.resolve([
        { id: 'continue-listening', entities: inProgress },
        { id: 'continue-series', entities: series },
      ]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderHome(onPlay = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ResumeHome libraryId="L1" onPlay={onPlay} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onPlay, view };
}

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ResumeHome: Continue series', () => {
  it('shows the next book of a series even when nothing is in progress, and starts it', async () => {
    serve({ inProgress: [], series: [COPPER] });
    const { onPlay } = renderHome();
    expect(await screen.findByRole('heading', { name: 'Continue series' })).toBeInTheDocument();
    expect(screen.getByText('Book 2 of Sherlock Holmes')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resume listening' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start The Adventure of the Copper Beeches' }));
    expect(onPlay).toHaveBeenCalledWith('b2');
  });

  it('sits below the resume hero when a book is in progress', async () => {
    serve({ inProgress: [RABBIT], series: [COPPER] });
    renderHome();
    const hero = await screen.findByRole('region', { name: 'Resume listening' });
    const shelf = await screen.findByRole('heading', { name: 'Continue series' });
    expect(hero.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not repeat a book that is already in Continue listening', async () => {
    serve({ inProgress: [COPPER], series: [COPPER] });
    renderHome();
    await screen.findByRole('region', { name: 'Resume listening' });
    await waitFor(() => expect(absFetch).toHaveBeenCalledWith(expect.stringContaining('/personalized')));
    expect(screen.queryByRole('heading', { name: 'Continue series' })).not.toBeInTheDocument();
  });

  it('renders nothing when there is nothing to carry on with', async () => {
    serve({ inProgress: [], series: [] });
    const { view } = renderHome();
    await waitFor(() => expect(absFetch).toHaveBeenCalledWith(expect.stringContaining('/personalized')));
    await new Promise((r) => setTimeout(r, 20));
    expect(view.container).toBeEmptyDOMElement();
  });
});
