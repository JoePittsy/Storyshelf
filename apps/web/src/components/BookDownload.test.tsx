// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@joepittsy/ui';

vi.mock('../downloads', async (orig) => ({
  ...(await orig<typeof import('../downloads')>()),
  downloadsSupported: () => true,
  startDownload: vi.fn(async () => ({ ok: true })),
  pauseDownload: vi.fn(async () => undefined),
  resumeDownload: vi.fn(async () => undefined),
  removeDownload: vi.fn(async () => undefined),
}));

import * as downloads from '../downloads';
import { markReachable, markUnreachable, resetConnectivityForTests } from '../api/connectivity';
import { BookDownload } from './BookDownload';
import type { DownloadedBook } from '../downloads';

const book = (over: Partial<DownloadedBook> = {}): DownloadedBook => ({
  itemId: 'li_1',
  libraryId: 'lib',
  title: 'The Hobbit',
  author: 'J. R. R. Tolkien',
  coverUrl: null,
  duration: 600,
  bytes: 210e6,
  totalBytes: 500e6,
  status: 'downloading',
  addedAt: 1,
  ...over,
});

function renderControl(permissions: Record<string, boolean> = { download: true }) {
  const qc = new QueryClient();
  qc.setQueryData(['session'], { id: 'u', username: 'joe', accessToken: 't', permissions });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BookDownload itemId="li_1" title="The Hobbit" />
      </ToastProvider>
    </QueryClientProvider>
  );
}

// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal ||= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ||= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

beforeEach(() => {
  localStorage.clear();
  downloads.setDownloadsForTests([]);
});
afterEach(() => {
  cleanup();
  resetConnectivityForTests();
  vi.clearAllMocks();
});

describe('BookDownload', () => {
  it('offers Download, starts it, and says once that downloads pause outside the app', async () => {
    renderControl();
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(downloads.startDownload).toHaveBeenCalledWith('li_1');
    expect(await screen.findByText(/Downloads pause if you leave the app/)).toBeInTheDocument();
    expect(localStorage.getItem('storyshelf.downloads.toldForeground')).toBe('1');
  });

  it('says why when a download can’t start', async () => {
    vi.mocked(downloads.startDownload).mockResolvedValueOnce({ ok: false, reason: 'Not enough space.' });
    renderControl();
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByText('Not enough space.')).toHaveAttribute('role', 'alert');
  });

  it('is disabled, with a reason, for an account without the download permission', () => {
    renderControl({ download: false });
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    expect(screen.getByText('Downloads are turned off for your account.')).toBeInTheDocument();
  });

  it('offers nothing to start while offline', () => {
    markUnreachable();
    renderControl();
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('shows progress, with pause and cancel', async () => {
    downloads.setDownloadsForTests([book()]);
    renderControl();
    expect(screen.getByText(/^Downloading 42%/)).toHaveTextContent('Downloading 42% · 210 MB of 500 MB');
    expect(screen.getByRole('progressbar', { name: 'Downloading The Hobbit' })).toHaveAttribute('aria-valuenow', '42');
    await userEvent.click(screen.getByRole('button', { name: 'Pause download of The Hobbit' }));
    expect(downloads.pauseDownload).toHaveBeenCalledWith('li_1');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel download of The Hobbit' }));
    expect(downloads.removeDownload).toHaveBeenCalledWith('li_1');
  });

  it('follows the store as the download moves', () => {
    downloads.setDownloadsForTests([book()]);
    renderControl();
    act(() => downloads.setDownloadsForTests([book({ bytes: 400e6 })]));
    expect(screen.getByText(/^Downloading 80%/)).toBeInTheDocument();
    act(() => downloads.setDownloadsForTests([book({ status: 'complete', bytes: 500e6 })]));
    expect(screen.getByText('Downloaded · 500 MB')).toBeInTheDocument();
  });

  it('says why it paused and offers Resume, but not while offline', async () => {
    downloads.setDownloadsForTests([book({ status: 'paused', error: 'Waiting for a connection.' })]);
    renderControl();
    expect(screen.getByText('Paused at 42%')).toBeInTheDocument();
    expect(screen.getByText('Waiting for a connection.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume download: The Hobbit' }));
    expect(downloads.resumeDownload).toHaveBeenCalledWith('li_1');
    act(() => markUnreachable());
    expect(screen.queryByRole('button', { name: /Resume/ })).toBeNull();
    act(() => markReachable());
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument();
  });

  it('says it failed and why, with Try again', async () => {
    downloads.setDownloadsForTests([book({ status: 'failed', error: 'This device ran out of space.' })]);
    renderControl();
    expect(screen.getByText("Couldn't download")).toBeInTheDocument();
    expect(screen.getByText('This device ran out of space.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again: download The Hobbit' }));
    expect(downloads.resumeDownload).toHaveBeenCalledWith('li_1');
  });

  it('removes a finished download only once confirmed', async () => {
    downloads.setDownloadsForTests([book({ status: 'complete', bytes: 500e6 })]);
    renderControl();
    await userEvent.click(screen.getByRole('button', { name: 'Remove download of The Hobbit' }));
    expect(screen.getByRole('dialog', { name: 'Remove the download?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(downloads.removeDownload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove download of The Hobbit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(downloads.removeDownload).toHaveBeenCalledWith('li_1');
  });
});
