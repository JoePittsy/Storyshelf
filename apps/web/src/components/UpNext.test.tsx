// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

const player = vi.hoisted(() => ({
  state: { item: null as { id: string } | null, ended: false, status: 'paused' },
  play: vi.fn(),
}));
vi.mock('../player/engine', () => ({
  usePlayer: () => ({ ...player.state, play: player.play }),
}));

import * as auth from '../api/auth';
import { BookNextInSeries, NowPlayingUpNext } from './UpNext';

const absFetch = vi.mocked(auth.absFetch);

const seriesItem = (id: string, title: string, sequence: string) => ({
  id,
  updatedAt: 1,
  media: { duration: 3000, metadata: { title, authorName: 'Arthur Conan Doyle', series: { sequence } } },
});

function serve(progress: object[] = []) {
  absFetch.mockImplementation((path: string) => {
    const u = new URL(path, 'http://x');
    if (u.pathname === '/api/items/b1')
      return Promise.resolve({
        id: 'b1',
        libraryId: 'L1',
        updatedAt: 1,
        media: {
          duration: 3000,
          chapters: [],
          metadata: { title: 'The Adventure of the Blue Carbuncle', series: [{ id: 'S', name: 'Sherlock Holmes', sequence: '1' }] },
        },
      });
    if (u.pathname === '/api/libraries/L1/items')
      return Promise.resolve({
        results: [
          seriesItem('b2', 'The Adventure of the Copper Beeches', '2'),
          seriesItem('b1', 'The Adventure of the Blue Carbuncle', '1'),
        ],
      });
    if (path === '/api/me') return Promise.resolve({ mediaProgress: progress });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderIn(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  player.state = { item: { id: 'b1' }, ended: false, status: 'paused' };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Up next on Now Playing', () => {
  it('does not appear mid-book', async () => {
    serve();
    renderIn(<NowPlayingUpNext />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
    expect(absFetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/libraries/'));
  });

  it('once the book has ended, offers the next one, and plays it without auto-playing', async () => {
    serve();
    player.state.ended = true;
    renderIn(<NowPlayingUpNext />);
    const card = await screen.findByRole('region', { name: 'Up next' });
    expect(card).toHaveTextContent('The Adventure of the Copper Beeches');
    expect(card).toHaveTextContent('Book 2 of Sherlock Holmes');
    expect(player.play).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Start: The Adventure of the Copper Beeches' }));
    expect(player.play).toHaveBeenCalledWith('b2');
  });

  it('offers a book already begun as Continue, with the time left', async () => {
    serve([{ libraryItemId: 'b2', progress: 0.5, currentTime: 1500, isFinished: false }]);
    player.state.ended = true;
    renderIn(<NowPlayingUpNext />);
    expect(await screen.findByRole('button', { name: 'Continue: The Adventure of the Copper Beeches' })).toBeInTheDocument();
    expect(screen.getByText('Book 2 of Sherlock Holmes · 25m left')).toBeInTheDocument();
  });

  it('closing it sticks for that book', async () => {
    serve();
    player.state.ended = true;
    const view = renderIn(<NowPlayingUpNext />);
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss up next' }));
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
    view.unmount();
    renderIn(<NowPlayingUpNext />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
  });

  it('has nothing to offer when the next book is finished too', async () => {
    serve([{ libraryItemId: 'b2', progress: 1, isFinished: true }]);
    player.state.ended = true;
    renderIn(<NowPlayingUpNext />);
    await waitFor(() => expect(absFetch).toHaveBeenCalledWith('/api/me'));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
  });
});

describe('Next in series on the Book screen', () => {
  it('shows for a finished book, linking to the next one', async () => {
    serve();
    renderIn(<BookNextInSeries bookId="b1" finished />);
    const card = await screen.findByRole('region', { name: 'Next in Sherlock Holmes' });
    expect(card).toHaveTextContent('Book 2');
    expect(screen.getByRole('link', { name: 'The Adventure of the Copper Beeches' })).toHaveAttribute('href', '/book/b2');
    expect(screen.queryByRole('button', { name: 'Dismiss up next' })).not.toBeInTheDocument();
  });

  it('is not there for a book not yet finished', async () => {
    serve();
    renderIn(<BookNextInSeries bookId="b1" finished={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: /Next in/ })).not.toBeInTheDocument();
  });
});
