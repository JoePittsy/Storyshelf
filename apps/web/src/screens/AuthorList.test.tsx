// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { AuthorList } from './AuthorList';

const absFetch = vi.mocked(auth.absFetch);

afterEach(cleanup);

describe('Authors list', () => {
  it('sorts and shows "Surname, First" but draws the same initial as the author page (from `name`)', async () => {
    absFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/api/libraries'
          ? { libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book' }] }
          : { authors: [{ id: 'a1', name: 'Honoré de Balzac', lastFirst: 'de Balzac, Honoré', numBooks: 2 }] }
      )
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AuthorList />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const link = await screen.findByRole('link', { name: /de Balzac, Honoré/ });
    expect(link).toBeInTheDocument();
    const avatar = link.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(avatar?.style.getPropertyValue('--initial')).toBe('"H"');
  });
});
