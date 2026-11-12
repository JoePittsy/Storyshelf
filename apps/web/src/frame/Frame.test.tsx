// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The route announcement: the frame's own status line (the toast region is another).
const announcement = () => screen.getAllByRole('status').find((el) => el.className.includes('announce')) as HTMLElement;

function renderFrame() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route element={<Frame />}>
              <Route
                path="/settings"
                element={
                  <main>
                    Settings page <Link to="/authors">Authors</Link>
                  </main>
                }
              />
              <Route path="/authors" element={<main>Authors page</main>} />
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

  // The frame mounts before the page's title is set, so what it says at first is the app's name alone. The page it
  // lands on (a load, or the landing after sign-in) has to be said once its title is there, without taking focus.
  it('announces the page it lands on, once its title is set, and leaves focus alone', () => {
    vi.useFakeTimers();
    renderFrame();
    const status = announcement();
    expect(document.title).toBe('Settings · Storyshelf');
    act(() => void vi.advanceTimersByTime(300));
    expect(status).toHaveTextContent('Settings · Storyshelf');
    expect(document.body).toHaveFocus();
  });

  it('announces the next page and moves focus to it', () => {
    vi.useFakeTimers();
    renderFrame();
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Authors' }));
    act(() => void vi.advanceTimersByTime(300));
    expect(announcement()).toHaveTextContent('Authors · Storyshelf');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
