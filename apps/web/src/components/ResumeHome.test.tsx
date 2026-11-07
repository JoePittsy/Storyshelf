// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';

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
      <ToastProvider>
        <MemoryRouter>
          <ResumeHome libraryId="L1" onPlay={onPlay} />
        </MemoryRouter>
      </ToastProvider>
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

const BLUE = book('b1', 'The Adventure of the Blue Carbuncle', { name: 'Sherlock Holmes', sequence: '1' });
const PETER = book('p', 'The Tale of Peter Rabbit');

/** A server that keeps each book's progress record, and hides one when asked, as ABS 2.37.2 does. */
function serveProgress(inProgress: { id: string }[], series: object[] = []) {
  const hidden = new Set<string>();
  const record = (id: string) => ({
    id: `mp_${id}`,
    libraryItemId: id,
    currentTime: 600,
    duration: 3600,
    progress: 0.3,
    isFinished: false,
    hideFromContinueListening: hidden.has(id),
    lastUpdate: 5,
  });
  absFetch.mockImplementation((path: string, init: RequestInit = {}) => {
    const u = new URL(path, 'http://x');
    const method = init.method ?? 'GET';
    const hide = u.pathname.match(/^\/api\/me\/progress\/mp_(\w+)\/remove-from-continue-listening$/);
    if (hide) {
      hidden.add(hide[1]);
      return Promise.resolve({});
    }
    const one = u.pathname.match(/^\/api\/me\/progress\/(\w+)$/);
    if (one && method === 'GET') return Promise.resolve(record(one[1]));
    if (one && method === 'PATCH') {
      if ((JSON.parse(init.body as string) as { hideFromContinueListening?: boolean }).hideFromContinueListening === false)
        hidden.delete(one[1]);
      return Promise.resolve(undefined);
    }
    if (path === '/api/me') return Promise.resolve({ mediaProgress: inProgress.map((b) => record(b.id)) });
    if (u.pathname === '/api/me/items-in-progress') return Promise.resolve({ libraryItems: inProgress });
    if (u.pathname === '/api/libraries/L1/personalized') return Promise.resolve([{ id: 'continue-series', entities: series }]);
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
}

const heroTitle = async () =>
  (await screen.findByRole('region', { name: 'Resume listening' })).querySelector('a')?.textContent;
/** Opens a book's menu and picks `name` from it. */
async function choose(menu: string, name: string) {
  const trigger = screen.getByRole('button', { name: menu });
  await userEvent.click(trigger);
  const panel = document.getElementById(trigger.getAttribute('popovertarget') ?? '')!;
  await userEvent.click(within(panel).getByRole('button', { name, hidden: true }));
}

describe('ResumeHome: Remove from Continue listening', () => {
  it('is offered on the hero and on each Continue listening tile, but not on Continue series', async () => {
    serveProgress([RABBIT, PETER], [BLUE]);
    renderHome();
    await screen.findByRole('heading', { name: 'Continue series' });
    expect(screen.getByRole('button', { name: 'More for The Velveteen Rabbit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More for The Tale of Peter Rabbit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More for The Adventure of the Blue Carbuncle' })).not.toBeInTheDocument();
  });

  it('removing the hero puts the next book in its place, with an Undo that brings it back', async () => {
    serveProgress([RABBIT, PETER, COPPER]);
    renderHome();
    expect(await heroTitle()).toBe('The Velveteen Rabbit');
    await choose('More for The Velveteen Rabbit', 'Remove from Continue listening');
    expect(await screen.findByText('Removed from Continue listening')).toBeInTheDocument();
    expect(absFetch).toHaveBeenCalledWith('/api/me/progress/mp_r/remove-from-continue-listening');
    await waitFor(async () => expect(await heroTitle()).toBe('The Tale of Peter Rabbit'));
    // The new hero is no longer on the shelf beneath it; the shelf keeps the rest.
    expect(screen.queryByRole('button', { name: 'More for The Velveteen Rabbit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume The Tale of Peter Rabbit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume The Adventure of the Copper Beeches' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await heroTitle()).toBe('The Velveteen Rabbit'));
  });

  it('removing a shelf book keeps the hero and takes the tile off the shelf', async () => {
    serveProgress([RABBIT, PETER, COPPER]);
    renderHome();
    await screen.findByRole('button', { name: 'More for The Tale of Peter Rabbit' });
    await choose('More for The Tale of Peter Rabbit', 'Remove from Continue listening');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Resume The Tale of Peter Rabbit' })).not.toBeInTheDocument()
    );
    expect(await heroTitle()).toBe('The Velveteen Rabbit');
  });
});
