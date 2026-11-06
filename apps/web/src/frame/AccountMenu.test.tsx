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

import * as auth from '../api/auth';
import { stop } from '../player/engine';
import { AccountMenu } from './AccountMenu';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderMenu() {
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
      <AccountMenu />
    </QueryClientProvider>,
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

  it('closes on Escape and returns focus to the button', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Account: joe' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
