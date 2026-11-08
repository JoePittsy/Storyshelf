// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@joepittsy/ui';

vi.mock('../pwa/updates', async (orig) => ({
  ...(await orig<typeof import('../pwa/updates')>()),
  useUpdateReady: vi.fn(() => false),
  applyUpdate: vi.fn(),
}));

import * as updates from '../pwa/updates';
import { UpdatePrompt } from './UpdatePrompt';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPrompt = () =>
  render(
    <ToastProvider>
      <UpdatePrompt />
    </ToastProvider>
  );

describe('UpdatePrompt', () => {
  it('says nothing until a release is ready', () => {
    renderPrompt();
    expect(screen.queryByText(/new version/)).toBeNull();
  });

  it('offers a ready release, and Update moves to it', async () => {
    vi.mocked(updates.useUpdateReady).mockReturnValue(true);
    renderPrompt();
    expect(screen.getByText('A new version of Storyshelf is ready.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(updates.applyUpdate).toHaveBeenCalledOnce();
  });
});
