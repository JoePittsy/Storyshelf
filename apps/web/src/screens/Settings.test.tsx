// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/auth', async (orig) => ({
  ...(await orig<typeof import('../api/auth')>()),
  restoreSession: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
}));
const setSkip = vi.fn();
vi.mock('../player/engine', () => ({
  stop: vi.fn(() => Promise.resolve()),
  usePlayer: () => ({ skipBack: 30, skipForward: 45, setSkip }),
}));
vi.mock('../api/libraries', async (orig) => ({
  ...(await orig<typeof import('../api/libraries')>()),
  useLibraries: () => ({ data: [] }),
}));

import * as auth from '../api/auth';
import { stop } from '../player/engine';
import { Settings } from './Settings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettings() {
  vi.mocked(auth.restoreSession).mockResolvedValue({ id: 'u1', username: 'joe', accessToken: 't' });
  HTMLDialogElement.prototype.showModal ||= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ||= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Settings', () => {
  it('names who is signed in and signs out through the same confirmation as the account menu', async () => {
    renderSettings();
    expect(await screen.findByText('joe')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('heading', { name: 'Sign out of Storyshelf?' })).toBeInTheDocument();
    expect(stop).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    expect(stop).toHaveBeenCalledOnce();
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it('sets the skip intervals, keeping the other as it was', async () => {
    renderSettings();
    await userEvent.selectOptions(screen.getByLabelText('Skip back'), '15');
    expect(setSkip).toHaveBeenCalledWith(15, 45);
    await userEvent.selectOptions(screen.getByLabelText('Skip forward'), '60');
    expect(setSkip).toHaveBeenCalledWith(30, 60);
  });

  it('lists the keyboard shortcuts', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Play or pause')).toBeInTheDocument();
  });
});
