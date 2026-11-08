// @vitest-environment jsdom
/**
 * The offline states on screen: frame/Offline.tsx, frame/useNeedsConnection.ts, Frame and RequireSession (App.tsx).
 * A quiet badge while offline; a page with nothing kept says it needs a connection, one with something kept shows it;
 * a launch offline stays signed in, and one with nobody kept says it needs a connection instead of asking to sign in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query';
import { ToastProvider } from '@joepittsy/ui';
import { markReachable, markUnreachable, resetConnectivityForTests, startConnectivity } from '../api/connectivity';
import { followConnectivity } from '../api/queryCache';

vi.mock('../api/libraries', async (orig) => ({
  ...(await orig<typeof import('../api/libraries')>()),
  useLibraries: () => ({ data: [], isPending: false }),
}));
vi.mock('../player/engine', () => ({ usePlayer: () => ({}) }));
vi.mock('../player/RestoreLastBook', () => ({ RestoreLastBook: () => null }));
vi.mock('../player/useUndoableJump', () => ({ usePlayerJump: () => ({}) }));
vi.mock('../player/useBookmarkHere', () => ({ useBookmarkHere: () => () => {} }));
vi.mock('./AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('../api/auth', async (orig) => ({
  ...(await orig<typeof import('../api/auth')>()),
  restoreSession: vi.fn(),
}));

import { restoreSession } from '../api/auth';
import { RequireSession } from '../App';
import { Frame } from './Frame';
import { OfflineBadge } from './Offline';

afterEach(() => {
  cleanup();
  resetConnectivityForTests();
  onlineManager.setOnline(true);
  vi.mocked(restoreSession).mockReset();
});

/** A page made of the authors query, which never answers by itself. */
function AuthorsPage() {
  const q = useQuery({ queryKey: ['authors', 'lib1'], queryFn: () => new Promise<string[]>(() => undefined) });
  return <main>{q.data ? `Authors: ${q.data.join(', ')}` : 'Loading authors'}</main>;
}

function renderFrame(qc = new QueryClient()) {
  followConnectivity();
  qc.mount();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/authors']}>
          <Routes>
            <Route element={<Frame />}>
              <Route path="/authors" element={<AuthorsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return qc;
}

describe('OfflineBadge', () => {
  it('shows nothing online, and a quiet Offline chip offline', () => {
    render(<OfflineBadge />);
    expect(screen.queryByText('Offline')).toBeNull();
    act(() => markUnreachable());
    expect(screen.getByText('Offline')).toBeInTheDocument();
    act(() => markReachable());
    expect(screen.queryByText('Offline')).toBeNull();
  });
});

describe('a page offline', () => {
  it('with nothing kept, says plainly that it needs a connection', () => {
    act(() => markUnreachable());
    renderFrame();
    expect(screen.getByText('This page needs a connection.')).toBeVisible();
    expect(screen.queryByText('Loading authors')).not.toBeVisible();
  });

  it('with something kept, shows it, with the badge', () => {
    act(() => markUnreachable());
    const qc = new QueryClient();
    qc.setQueryData(['authors', 'lib1'], ['Ursula']);
    renderFrame(qc);
    expect(screen.getByText('Authors: Ursula')).toBeVisible();
    expect(screen.queryByText('This page needs a connection.')).toBeNull();
    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
  });

  it('online, a page still loading is just loading', () => {
    renderFrame();
    expect(screen.getByText('Loading authors')).toBeVisible();
    expect(screen.queryByText('This page needs a connection.')).toBeNull();
  });

  it('Try again asks the server again', async () => {
    const probe = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const stop = startConnectivity(probe);
    act(() => markUnreachable());
    renderFrame();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(probe).toHaveBeenCalled();
    stop();
  });
});

describe('RequireSession', () => {
  function renderSession() {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/sign-in" element={<p>Sign in page</p>} />
            <Route element={<RequireSession />}>
              <Route path="/" element={<p>Library page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('offline with the user kept on this device, stays signed in', async () => {
    vi.mocked(restoreSession).mockResolvedValue({ id: 'u1', username: 'joe', accessToken: '' });
    renderSession();
    expect(await screen.findByText('Library page')).toBeInTheDocument();
  });

  it('offline with nobody kept, says it needs a connection rather than asking to sign in', async () => {
    vi.mocked(restoreSession).mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    expect(await screen.findByText(/Storyshelf needs a connection to open/)).toBeInTheDocument();
    expect(screen.queryByText('Sign in page')).toBeNull();
  });

  it('signed out (a 401) still goes to sign in', async () => {
    vi.mocked(restoreSession).mockResolvedValue(null);
    renderSession();
    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
  });
});
