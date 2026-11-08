// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@joepittsy/ui';

// The frame's own job is under test here, not the library, the player or the account.
vi.mock('../api/libraries', async (orig) => ({
  ...(await orig<typeof import('../api/libraries')>()),
  useLibraries: () => ({ data: [], isPending: false }),
}));
vi.mock('../player/engine', () => ({ usePlayer: () => ({}) }));
vi.mock('../player/RestoreLastBook', () => ({ RestoreLastBook: () => null }));
vi.mock('../player/useUndoableJump', () => ({ usePlayerJump: () => ({}) }));
vi.mock('../player/useBookmarkHere', () => ({ useBookmarkHere: () => () => {} }));
vi.mock('./AccountMenu', () => ({ AccountMenu: () => null }));

import { Frame } from './Frame';

afterEach(cleanup);

function renderFrame() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route element={<Frame />}>
              <Route path="/settings" element={<main>Settings page</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('Frame', () => {
  // A skip link needs a real target, so it works without the script and axe's skip-link rule passes.
  it('points the skip link at the element that holds the page', () => {
    renderFrame();
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveAttribute('href', '#main');
    const target = document.getElementById('main');
    expect(target).toContainElement(screen.getByRole('main'));
  });
});
