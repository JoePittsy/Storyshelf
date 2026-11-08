// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';
import { setDownloadsForTests, type DownloadedBook } from '../downloads';
import { OfflineHome } from './OfflineHome';

const dl = (itemId: string, title: string, over: Partial<DownloadedBook> = {}): DownloadedBook => ({
  itemId,
  libraryId: 'L1',
  title,
  author: 'Arthur Conan Doyle',
  coverUrl: null,
  duration: 3600,
  bytes: 200e6,
  totalBytes: 200e6,
  status: 'complete',
  addedAt: 1,
  ...over,
});

function renderHome(onPlay = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'offlineFirst' } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <OfflineHome onPlay={onPlay} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return onPlay;
}

afterEach(() => {
  cleanup();
  setDownloadsForTests([]);
});

describe('OfflineHome', () => {
  it('with nothing downloaded, says how to get something to listen to offline', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'Downloads' })).toBeInTheDocument();
    expect(screen.getByText('No downloads yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Jump back in' })).not.toBeInTheDocument();
  });

  it('offers a download to jump back in to, and lists every download with how it stands', async () => {
    setDownloadsForTests([
      dl('b1', 'A Study in Scarlet', { addedAt: 2 }),
      dl('b2', 'The Sign of the Four', { status: 'downloading', bytes: 50e6 }),
    ]);
    const onPlay = renderHome();
    const hero = screen.getByRole('region', { name: 'Jump back in' });
    expect(within(hero).getByText('A Study in Scarlet')).toBeInTheDocument();
    await userEvent.click(within(hero).getByRole('button', { name: /Resume/ }));
    expect(onPlay).toHaveBeenCalledWith('b1');

    const list = screen.getByRole('list');
    expect(within(list).getByText(/Downloaded · 200 MB/)).toBeInTheDocument();
    expect(within(list).getByText(/Downloading 25%/)).toBeInTheDocument();
    // Only a book on the device in full can play.
    expect(within(list).getAllByRole('button', { name: /^Play / })).toHaveLength(1);
    await userEvent.click(within(list).getByRole('button', { name: 'Play A Study in Scarlet' }));
    expect(onPlay).toHaveBeenLastCalledWith('b1');
  });
});
