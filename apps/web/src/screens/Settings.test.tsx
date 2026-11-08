// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/auth', async (orig) => ({
  ...(await orig<typeof import('../api/auth')>()),
  restoreSession: vi.fn(),
  getStatus: vi.fn(() => Promise.resolve({ serverVersion: '2.37.2', isInit: true, authMethods: ['local'] })),
  logout: vi.fn(() => Promise.resolve()),
}));
const setSkip = vi.fn();
const setDefaultRate = vi.fn();
const setRewindOnResume = vi.fn();
const undoReset = vi.fn();
const resetBookSpeeds = vi.fn(() => undoReset);
vi.mock('../player/engine', () => ({
  stop: vi.fn(() => Promise.resolve()),
  usePlayer: () => ({
    skipBack: 30,
    skipForward: 45,
    setSkip,
    defaultRate: 1.2,
    setDefaultRate,
    resetBookSpeeds,
    rewindOnResume: true,
    setRewindOnResume,
  }),
}));
let bookSpeedCount = 0;
vi.mock('../player/bookSpeeds', () => ({ useBookSpeedCount: () => bookSpeedCount }));
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
  bookSpeedCount = 0;
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
      <ToastProvider>
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('Settings', () => {
  it('says which version of Storyshelf this is, and which Audiobookshelf it talks to', async () => {
    renderSettings();
    const about = screen.getByRole('region', { name: 'About' });
    expect(within(about).getByText('9.9.9 (abc1234)')).toBeInTheDocument();
    expect(await within(about).findByText('2.37.2')).toBeInTheDocument();
    expect(within(about).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/JoePittsy/Storyshelf'
    );
    expect(within(about).getByRole('link', { name: 'Player log' })).toHaveAttribute('href', '/debug');
    expect(within(about).getByRole('link', { name: 'Storage test' })).toHaveAttribute('href', '/debug/storage');
  });

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

  it('sets the default speed, showing the one in use', async () => {
    renderSettings();
    expect(screen.getByLabelText('Default speed')).toHaveValue('1.2');
    await userEvent.selectOptions(screen.getByLabelText('Default speed'), '1.5');
    expect(setDefaultRate).toHaveBeenCalledWith(1.5);
  });

  it('says in one line that a speed set on the player stays with that book', () => {
    renderSettings();
    expect(screen.getByText(/stays with that book on this device/)).toBeInTheDocument();
  });

  it('offers to reset book speeds only when there are some, with an Undo', async () => {
    renderSettings();
    expect(screen.queryByRole('button', { name: 'Reset all book speeds' })).not.toBeInTheDocument();
    cleanup();
    bookSpeedCount = 3;
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Reset all book speeds' }));
    expect(resetBookSpeeds).toHaveBeenCalledOnce();
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(undoReset).toHaveBeenCalledOnce();
  });

  it('turns rewinding after a pause on and off; it is on to begin with', async () => {
    renderSettings();
    expect(screen.getByLabelText('Rewind after a pause')).toHaveValue('on');
    await userEvent.selectOptions(screen.getByLabelText('Rewind after a pause'), 'off');
    expect(setRewindOnResume).toHaveBeenCalledWith(false);
  });

  it('lists the keyboard shortcuts', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Play or pause')).toBeInTheDocument();
  });

  // An iPhone has no keyboard to press them on. An iPad with a trackpad (a fine pointer, hover) still lists them.
  it('leaves the keyboard shortcuts out on a touch-only device', () => {
    const touchOnly = (query: string) => ({
      matches: query.includes('hover: none'),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('matchMedia', touchOnly);
    try {
      renderSettings();
      expect(screen.queryByRole('heading', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Playback' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
