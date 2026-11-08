// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';

vi.mock('../pwa/updates', async (orig) => ({
  ...(await orig<typeof import('../pwa/updates')>()),
  checkForUpdate: vi.fn(),
  applyUpdate: vi.fn(),
}));

import * as updates from '../pwa/updates';
import { UpdateCheck } from './UpdateCheck';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UpdateCheck', () => {
  it('checks now and says when it is up to date', async () => {
    vi.mocked(updates.checkForUpdate).mockResolvedValue('current');
    render(<UpdateCheck />);
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText('You’re up to date.')).toBeInTheDocument();
  });

  it('says when it could not ask', async () => {
    vi.mocked(updates.checkForUpdate).mockResolvedValue('failed');
    render(<UpdateCheck />);
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText(/Couldn’t check/)).toBeInTheDocument();
  });
});
