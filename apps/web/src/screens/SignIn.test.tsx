// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../api/auth', () => {
  class AbsError extends Error {
    constructor(public status: number) {
      super(`ABS ${status}`);
    }
  }
  class UnsupportedServerError extends Error {
    constructor(public reason: string) {
      super(reason);
    }
  }
  return { AbsError, UnsupportedServerError, getStatus: vi.fn(), assertSupported: vi.fn(), login: vi.fn() };
});

import * as auth from '../api/auth';
import { SignIn } from './SignIn';

const mocked = vi.mocked(auth);
const { AbsError, UnsupportedServerError } = auth;

function renderSignIn() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/sign-in']}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function submit() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Username'), 'joe');
  await user.type(screen.getByLabelText('Password'), 'pw');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  mocked.getStatus.mockResolvedValue({} as never);
  mocked.assertSupported.mockReturnValue(undefined);
});
afterEach(cleanup);

describe('SignIn', () => {
  it.each([
    [new AbsError(401, 'x'), 'Wrong username or password.'],
    [new AbsError(429, 'x'), 'Too many sign-in attempts. Try again in a few minutes.'],
    [new Error('fetch failed'), "Can't reach the server. Check your connection and try again."],
    [new AbsError(500, 'x'), "Can't reach the server. Check your connection and try again."],
  ])('shows the message for a failed login (%#)', async (err, text) => {
    mocked.login.mockRejectedValue(err);
    renderSignIn();
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it.each([
    ['version', 'Storyshelf needs Audiobookshelf 2.26 or newer.'],
    ['no-local-auth', "This server only allows single sign-on, which Storyshelf doesn't support yet."],
    ['not-initialised', 'Finish setting up Audiobookshelf before signing in.'],
  ])('shows %s instead of the form', async (reason, text) => {
    mocked.assertSupported.mockImplementation(() => {
      throw new UnsupportedServerError(reason as never);
    });
    renderSignIn();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByLabelText('Username')).toBeNull();
  });

  it('shows no error for a supported, reachable server', async () => {
    renderSignIn();
    await screen.findByLabelText('Username');
    await new Promise((r) => setTimeout(r, 50)); // let the status query settle
    expect(screen.getByRole('alert')).toHaveTextContent('');
  });

  it('carries the wordmark and says which server it signs in to', async () => {
    renderSignIn();
    await screen.findByLabelText('Username');
    expect(screen.getByText('Storyshelf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    // Same-origin mode talks to the Audiobookshelf behind this page's own address.
    expect(screen.getByText(location.host)).toBeInTheDocument();
  });

  it('navigates away on success', async () => {
    mocked.login.mockResolvedValue({ username: 'joe' } as never);
    renderSignIn();
    await submit();
    expect(await screen.findByText('Home')).toBeTruthy();
  });
});
