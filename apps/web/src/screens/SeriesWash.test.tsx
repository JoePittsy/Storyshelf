// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));
// The colour comes from analysing the cover in a canvas, which jsdom doesn't have.
vi.mock('@joepittsy/ui', async (orig) => ({ ...(await orig<typeof import('@joepittsy/ui')>()), useDominantColor: () => '9, 8, 7' }));

import * as auth from '../api/auth';
import { Series } from './Series';

const absFetch = vi.mocked(auth.absFetch);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Series page colour', () => {
  it('washes the hero and the page ground with the first cover, like the book page', async () => {
    const b = { id: 'b1', updatedAt: 1, media: { metadata: { title: 'Act I', authorName: 'Neil Gaiman', series: { id: 's1', name: 'The Sandman', sequence: '1' } } } };
    absFetch.mockImplementation((path: string) => {
      if (path === '/api/me') return Promise.resolve({ mediaProgress: [] });
      if (path.startsWith('/api/series/s1')) return Promise.resolve({ id: 's1', name: 'The Sandman', description: null, libraryId: 'lib1' });
      if (path.startsWith('/api/libraries/lib1/items')) return Promise.resolve({ results: [b] });
      if (path.startsWith('/api/libraries/lib1/authors')) return Promise.resolve({ authors: [] });
      return Promise.reject(new auth.AbsError(404, 'Not Found'));
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/series/s1']}>
          <Routes>
            <Route path="/series/:id" element={<Series />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const title = await screen.findByRole('heading', { level: 1, name: 'The Sandman' });
    expect(title.closest('[style]')?.getAttribute('style')).toContain('rgba(9, 8, 7');
    expect(document.documentElement.style.getPropertyValue('--panel-color')).toBe('9, 8, 7');
    expect(document.documentElement.style.getPropertyValue('--panel-on')).toBe('1');
    cleanup();
    expect(document.documentElement.style.getPropertyValue('--panel-on')).toBe('');
  });
});
