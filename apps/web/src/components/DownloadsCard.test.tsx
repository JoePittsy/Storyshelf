// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

vi.mock('../downloads', async (orig) => ({
  ...(await orig<typeof import('../downloads')>()),
  downloadsSupported: () => true,
  downloadSpace: vi.fn(async () => ({ used: 0, free: 37.6e9 })),
  removeDownload: vi.fn(async () => undefined),
}));

import * as downloads from '../downloads';
import { DownloadsCard } from './DownloadsCard';
import type { DownloadedBook } from '../downloads';

// jsdom has no <dialog> methods.
HTMLDialogElement.prototype.showModal ||= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ||= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

const book = (itemId: string, over: Partial<DownloadedBook>): DownloadedBook => ({
  itemId,
  libraryId: 'lib',
  title: itemId,
  author: '',
  coverUrl: null,
  duration: 1,
  bytes: 525e6,
  totalBytes: 525e6,
  status: 'complete',
  addedAt: 1,
  ...over,
});

const renderCard = () =>
  render(
    <MemoryRouter>
      <DownloadsCard />
    </MemoryRouter>
  );

beforeEach(() => downloads.setDownloadsForTests([]));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DownloadsCard', () => {
  it('says how downloads work when there are none, and what is free', async () => {
    renderCard();
    expect(screen.getByText(/Books you download play with no connection/)).toBeInTheDocument();
    expect(await screen.findByText('37.6 GB free on this device')).toBeInTheDocument();
  });

  it('lists each download with its size and state, and the space they use', async () => {
    downloads.setDownloadsForTests([
      book('The Hobbit', {}),
      book('Dune', { status: 'downloading', bytes: 100e6, totalBytes: 1.2e9 }),
    ]);
    renderCard();
    expect(await screen.findByText('625 MB used by downloads · 37.6 GB free on this device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The Hobbit 525 MB · Downloaded' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dune 1.2 GB · Downloading 8%' })).toBeInTheDocument();
  });

  it('removes a download once confirmed', async () => {
    downloads.setDownloadsForTests([book('The Hobbit', {})]);
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Remove download of The Hobbit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(downloads.removeDownload).toHaveBeenCalledWith('The Hobbit');
  });
});
