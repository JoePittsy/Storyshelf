// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

const player = vi.hoisted(() => ({
  state: {
    item: null as { id: string; title: string } | null,
    ended: false,
    status: 'paused',
    duration: 3000,
  },
  play: vi.fn(),
}));
vi.mock('../player/engine', () => ({
  usePlayer: () => ({ ...player.state, play: player.play }),
}));

import * as auth from '../api/auth';
import { BookNextInSeries, NowPlayingEnd } from './UpNext';

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
          metadata: {
            title: 'The Adventure of the Blue Carbuncle',
            series: [{ id: 'S', name: 'Sherlock Holmes', sequence: '1' }],
          },
        },
      });
    if (u.pathname === '/api/libraries/L1/items')
      return Promise.resolve({
        results: [
          seriesItem('b2', 'The Adventure of the Copper Beeches', '2'),
          seriesItem('b1', 'The Adventure of the Blue Carbuncle', '1'),
        ],
      });
    if (u.pathname === '/api/items/solo')
      return Promise.resolve({
        id: 'solo',
        libraryId: 'L1',
        updatedAt: 1,
        media: { duration: 3780, chapters: [], metadata: { title: 'The Velveteen Rabbit', series: [] } },
      });
    if (path === '/api/me') return Promise.resolve({ mediaProgress: progress });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderIn(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/now-playing']}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree);
  return { ...view, again: () => view.rerender(tree) };
}

beforeEach(() => {
  localStorage.clear();
  player.state = {
    item: { id: 'b1', title: 'The Adventure of the Blue Carbuncle' },
    ended: false,
    status: 'paused',
    duration: 3000,
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Finished first: closing Up next (below) sticks for the rest of the file, as the dismissals are held in memory.
const DAY = 86_400_000;
const solo = () => {
  player.state = {
    item: { id: 'solo', title: 'The Velveteen Rabbit' },
    ended: false,
    status: 'paused',
    duration: 3780,
  };
};

describe('Finished on Now Playing', () => {
  it('a book with no next in its series ends into Finished: its length, the days it took, and the way on', async () => {
    serve([{ libraryItemId: 'solo', progress: 1, isFinished: true, startedAt: Date.now() - 3 * DAY }]);
    solo();
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    const card = await screen.findByRole('region', { name: 'Finished' });
    expect(card).toHaveTextContent('1h 3m over 4 days');
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('is not there while the book is under way', async () => {
    serve([{ libraryItemId: 'solo', progress: 0.5, isFinished: false, startedAt: Date.now() - DAY }]);
    solo();
    renderIn(<NowPlayingEnd />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: 'Finished' })).not.toBeInTheDocument();
  });

  it('gives way to Up next when the series has a next book', async () => {
    serve();
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    expect(await screen.findByRole('region', { name: 'Up next' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Finished' })).not.toBeInTheDocument();
  });

  it('shows for the last book of a series, once there is nothing after it', async () => {
    serve([{ libraryItemId: 'b2', progress: 1, isFinished: true }]);
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    expect(await screen.findByRole('region', { name: 'Finished' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
  });

  it('invents no numbers: with no start time or length it is the word alone', async () => {
    serve([]);
    solo();
    player.state.duration = 0;
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    const card = await screen.findByRole('region', { name: 'Finished' });
    expect(card).not.toHaveTextContent(/\d/);
    expect(card).not.toHaveTextContent(/day/);
  });

  it('goes back to the library, or plays the book again from the start', async () => {
    serve([]);
    solo();
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    await userEvent.click(await screen.findByRole('button', { name: 'Play again' }));
    expect(player.play).toHaveBeenCalledWith('solo', 0);
    await userEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('is said once to a screen reader, through a status that was there before the book ended', async () => {
    serve([]);
    solo();
    const view = renderIn(<NowPlayingEnd />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    player.state.ended = true;
    view.again();
    await waitFor(() => expect(status).toHaveTextContent('Finished: The Velveteen Rabbit.'));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('a series book that ends says Finished too, with what is up next', async () => {
    serve();
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Finished: The Adventure of the Blue Carbuncle. Up next: The Adventure of the Copper Beeches.'
      )
    );
  });
});

describe('Up next on Now Playing', () => {
  it('does not appear mid-book', async () => {
    serve();
    renderIn(<NowPlayingEnd />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
    expect(absFetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/libraries/'));
  });

  it('once the book has ended, offers the next one, and plays it without auto-playing', async () => {
    serve();
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    const card = await screen.findByRole('region', { name: 'Up next' });
    expect(card).toHaveTextContent('The Adventure of the Copper Beeches');
    expect(card).toHaveTextContent('Book 2 of Sherlock Holmes');
    expect(player.play).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Play: The Adventure of the Copper Beeches' }));
    expect(player.play).toHaveBeenCalledWith('b2');
  });

  it('offers a book already begun as Continue, with the time left', async () => {
    serve([{ libraryItemId: 'b2', progress: 0.5, currentTime: 1500, isFinished: false }]);
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
    expect(
      await screen.findByRole('button', { name: 'Resume: The Adventure of the Copper Beeches' })
    ).toBeInTheDocument();
    expect(screen.getByText('Book 2 of Sherlock Holmes · 25m left')).toBeInTheDocument();
  });

  it('closing it sticks for that book', async () => {
    serve();
    player.state.ended = true;
    const view = renderIn(<NowPlayingEnd />);
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss up next' }));
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
    // Finished doesn't take its place: the listener closed the end of this book, not just the offer.
    expect(screen.queryByRole('region', { name: 'Finished' })).not.toBeInTheDocument();
    view.unmount();
    renderIn(<NowPlayingEnd />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
  });

  it('has nothing to offer when the next book is finished too', async () => {
    serve([{ libraryItemId: 'b2', progress: 1, isFinished: true }]);
    player.state.ended = true;
    renderIn(<NowPlayingEnd />);
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
    expect(screen.getByRole('link', { name: 'The Adventure of the Copper Beeches' })).toHaveAttribute(
      'href',
      '/book/b2'
    );
    expect(screen.queryByRole('button', { name: 'Dismiss up next' })).not.toBeInTheDocument();
  });

  it('is not there for a book not yet finished', async () => {
    serve();
    renderIn(<BookNextInSeries bookId="b1" finished={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: /Next in/ })).not.toBeInTheDocument();
  });
});
