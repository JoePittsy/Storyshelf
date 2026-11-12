// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/auth', async (orig) => ({
  ...(await orig<typeof import('../api/auth')>()),
  restoreSession: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
}));
vi.mock('../player/engine', () => ({ stop: vi.fn(() => Promise.resolve()) }));
vi.mock('../downloads', async (orig) => ({
  ...(await orig<typeof import('../downloads')>()),
  removeAllDownloads: vi.fn(() => Promise.resolve()),
}));

import * as auth from '../api/auth';
import { stop } from '../player/engine';
import { removeAllDownloads, setDownloadsForTests } from '../downloads';
import { keepSleep, keptSleep } from '../player/sleepKept';
import { AccountMenu } from './AccountMenu';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setDownloadsForTests([]);
});

function renderMenu(onShowShortcuts?: () => void) {
  vi.mocked(auth.restoreSession).mockResolvedValue({ id: 'u1', username: 'joe', accessToken: 't' });
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal ||= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ||= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountMenu onShowShortcuts={onShowShortcuts} />
    </QueryClientProvider>
  );
}

describe('account menu', () => {
  it('names who is signed in, and asks before signing out', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Account: joe' });
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.getByText('joe')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    // Nothing has happened yet: the dialog says what will.
    expect(screen.getByRole('heading', { name: 'Sign out of Storyshelf?' })).toBeInTheDocument();
    expect(screen.getByText(/Playback will stop/)).toBeInTheDocument();
    expect(stop).not.toHaveBeenCalled();
    // The dialog's own button comes last: the menu closed when it was chosen.
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    expect(stop).toHaveBeenCalledOnce();
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it('says downloads go too, and removes them on signing out', async () => {
    const book = {
      libraryId: 'L1',
      author: 'A',
      coverUrl: null,
      duration: 60,
      status: 'complete' as const,
      addedAt: 1,
    };
    setDownloadsForTests([
      { ...book, itemId: 'a', title: 'A', bytes: 300e6, totalBytes: 300e6 },
      { ...book, itemId: 'b', title: 'B', bytes: 200e6, totalBytes: 200e6 },
    ]);
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: 'Account: joe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByText(/the 2 books downloaded to this device \(500 MB\) will be removed/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => expect(auth.logout).toHaveBeenCalledOnce());
    expect(removeAllDownloads).toHaveBeenCalledOnce();
    // Gone before the session is: the device keeps nothing of the listener's.
    expect(vi.mocked(removeAllDownloads).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(auth.logout).mock.invocationCallOrder[0] ?? 0
    );
  });

  it("forgets the device's sleep timer on signing out: the next person to sign in finds none", async () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 600_000 });
    expect(keptSleep('li_1')).not.toBeNull();
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: 'Account: joe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => expect(auth.logout).toHaveBeenCalledOnce());
    expect(keptSleep('li_1')).toBeNull();
  });

  it('closes on Escape and returns focus to the button', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Account: joe' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('account menu shortcuts', () => {
  it('lists Keyboard shortcuts, which closes the menu and asks for the list', async () => {
    const show = vi.fn();
    renderMenu(show);
    await userEvent.click(await screen.findByRole('button', { name: 'Account: joe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(show).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });
  it('has no such item when nothing can show the list', async () => {
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: 'Account: joe' }));
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });
});
