// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { BookDownload, HOLD_MS } from './BookDownload';
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

// jsdom has no popover API: an open popover is one with [data-open].
const shown = vi.fn();
HTMLElement.prototype.showPopover = function (this: HTMLElement) {
  this.setAttribute('data-open', '');
  shown();
};
HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
  this.removeAttribute('data-open');
};
const options = () => document.querySelector('[popover]');

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
  it('a download icon that starts the download, and says once that downloads pause outside the app', async () => {
    renderControl();
    await userEvent.click(screen.getByRole('button', { name: 'Download The Hobbit' }));
    expect(downloads.startDownload).toHaveBeenCalledWith('li_1');
    expect(await screen.findByText(/Downloads pause if you leave the app/)).toBeInTheDocument();
    expect(localStorage.getItem('storyshelf.downloads.toldForeground')).toBe('1');
  });

  it('says why when a download can’t start', async () => {
    vi.mocked(downloads.startDownload).mockResolvedValueOnce({ ok: false, reason: 'Not enough space.' });
    renderControl();
    await userEvent.click(screen.getByRole('button', { name: 'Download The Hobbit' }));
    expect(await screen.findByText('Not enough space.')).toBeInTheDocument();
  });

  it('for an account without the download permission, says so instead of starting', async () => {
    renderControl({ download: false });
    await userEvent.click(screen.getByRole('button', { name: 'Download The Hobbit' }));
    expect(downloads.startDownload).not.toHaveBeenCalled();
    expect(await screen.findByText('Downloads are turned off for your account.')).toBeInTheDocument();
  });

  it('offers nothing to start while offline', () => {
    markUnreachable();
    renderControl();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('downloading: a ring that fills, and a tap pauses', async () => {
    downloads.setDownloadsForTests([book()]);
    renderControl();
    const button = screen.getByRole('button', { name: 'Pause download of The Hobbit, 42%' });
    expect(button).toHaveAccessibleDescription('Press and hold, or right-click, to cancel.');
    expect(button.querySelector('svg circle:last-child')).toBeInTheDocument();
    await userEvent.click(button);
    expect(downloads.pauseDownload).toHaveBeenCalledWith('li_1');
  });

  it('holding opens Cancel instead of pausing', async () => {
    vi.useFakeTimers();
    try {
      downloads.setDownloadsForTests([book()]);
      renderControl();
      const button = screen.getByRole('button', { name: /^Pause download/ });
      fireEvent.pointerDown(button, { button: 0 });
      act(() => {
        vi.advanceTimersByTime(HOLD_MS);
      });
      // Held long enough: the button says so; the options open as it lets go.
      expect(button).toHaveAttribute('data-holding');
      expect(shown).not.toHaveBeenCalled();
      fireEvent.pointerUp(button);
      fireEvent.click(button);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(options()).toHaveAttribute('data-open');
      expect(button).not.toHaveAttribute('data-holding');
      expect(downloads.pauseDownload).not.toHaveBeenCalled();
      expect(options()).toHaveTextContent('Downloading 42% · 210 MB of 500 MB');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel download', hidden: true }));
      expect(downloads.removeDownload).toHaveBeenCalledWith('li_1');
      expect(options()).not.toHaveAttribute('data-open');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a short press is a tap, and the options also open on right-click and from the keyboard', async () => {
    vi.useFakeTimers();
    try {
      downloads.setDownloadsForTests([book()]);
      renderControl();
      const button = screen.getByRole('button', { name: /^Pause download/ });
      fireEvent.pointerDown(button, { button: 0 });
      act(() => {
        vi.advanceTimersByTime(HOLD_MS - 100);
      });
      fireEvent.pointerUp(button);
      fireEvent.click(button);
      expect(downloads.pauseDownload).toHaveBeenCalledOnce();
      expect(shown).not.toHaveBeenCalled();
      fireEvent.contextMenu(button);
      expect(shown).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(button, { key: 'ContextMenu' });
      fireEvent.keyDown(button, { key: 'F10', shiftKey: true });
      expect(shown).toHaveBeenCalledTimes(3);
      // A right-click leaves the next tap alone.
      fireEvent.click(button);
      expect(downloads.pauseDownload).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows the store as the download moves', () => {
    downloads.setDownloadsForTests([book()]);
    renderControl();
    act(() => downloads.setDownloadsForTests([book({ bytes: 400e6 })]));
    expect(screen.getByRole('button', { name: 'Pause download of The Hobbit, 80%' })).toBeInTheDocument();
    act(() => downloads.setDownloadsForTests([book({ status: 'complete', bytes: 500e6 })]));
    expect(screen.getByRole('button', { name: 'Downloaded: The Hobbit. Download options' })).toBeInTheDocument();
  });

  it('paused: a tap carries on, but offline it says it will by itself', async () => {
    downloads.setDownloadsForTests([book({ status: 'paused', error: 'Waiting for a connection.' })]);
    renderControl();
    const button = screen.getByRole('button', { name: 'Resume download of The Hobbit, paused at 42%' });
    expect(button).toHaveAccessibleDescription(/^Waiting for a connection\. Press and hold/);
    await userEvent.click(button);
    expect(downloads.resumeDownload).toHaveBeenCalledWith('li_1');
    act(() => markUnreachable());
    await userEvent.click(screen.getByRole('button', { name: 'Download of The Hobbit paused at 42%' }));
    expect(downloads.resumeDownload).toHaveBeenCalledOnce();
    expect(await screen.findByText(/carries on by itself when you’re back online/)).toBeInTheDocument();
    act(() => markReachable());
  });

  it('failed: says why, and a tap tries again', async () => {
    downloads.setDownloadsForTests([book({ status: 'failed', error: 'This device ran out of space.' })]);
    renderControl();
    const button = screen.getByRole('button', { name: 'Try downloading The Hobbit again' });
    expect(button).toHaveAccessibleDescription(/^This device ran out of space\./);
    await userEvent.click(button);
    expect(downloads.resumeDownload).toHaveBeenCalledWith('li_1');
  });

  it('downloaded: a tap offers Remove, which asks first', async () => {
    downloads.setDownloadsForTests([book({ status: 'complete', bytes: 500e6 })]);
    renderControl();
    const button = screen.getByRole('button', { name: 'Downloaded: The Hobbit. Download options' });
    await userEvent.click(button);
    expect(options()).toHaveAttribute('data-open');
    expect(options()).toHaveTextContent('Downloaded · 500 MB');
    await userEvent.click(screen.getByRole('button', { name: 'Remove download', hidden: true }));
    expect(screen.getByRole('dialog', { name: 'Remove the download?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(downloads.removeDownload).not.toHaveBeenCalled();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Remove download', hidden: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(downloads.removeDownload).toHaveBeenCalledWith('li_1');
  });

  it('downloaded books keep the button offline, to remove them', () => {
    markUnreachable();
    downloads.setDownloadsForTests([book({ status: 'complete', bytes: 500e6 })]);
    renderControl();
    expect(screen.getByRole('button', { name: /^Downloaded: The Hobbit/ })).toBeInTheDocument();
  });
});
