// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { Book } from './Book';
import { History, HistoryFinished, HistoryLog, HistoryStats } from './History';

const absFetch = vi.mocked(auth.absFetch);

const NOW = Date.parse('2026-11-06T12:00:00Z');

const chapters = [
  { id: 0, start: 0, end: 3600, title: 'Prologue' },
  { id: 1, start: 3600, end: 7200, title: 'Chaos' },
  { id: 2, start: 7200, end: 10800, title: 'Gods' },
];
const book = (id: string, title: string, chs = chapters) => ({
  id,
  updatedAt: 1,
  media: {
    metadata: { title, subtitle: null, authors: [{ id: 'a1', name: 'Stephen Fry' }], narrators: [], series: [], description: null, publishedYear: null },
    duration: 10800,
    chapters: chs,
  },
  userMediaProgress: { currentTime: 100, progress: 0.14, isFinished: false, startedAt: Date.parse('2026-11-01T09:00:00Z') },
});

const iphone = { osName: 'iOS', deviceType: 'mobile', clientName: 'Storyshelf' };
const session = (id: string, libraryItemId: string, title: string, startedAt: string, extra: object = {}) => ({
  id,
  libraryItemId,
  mediaType: 'book',
  displayTitle: title,
  displayAuthor: 'Stephen Fry',
  timeListening: 2880,
  startTime: 3700,
  currentTime: 8000,
  startedAt: Date.parse(startedAt),
  updatedAt: Date.parse(startedAt) + 2880_000,
  deviceInfo: iphone,
  ...extra,
});

const page = (sessions: object[], extra: object = {}) => ({
  sessions,
  total: sessions.length,
  numPages: 1,
  page: 0,
  itemsPerPage: 30,
  ...extra,
});

const SESSIONS = [
  session('s1', 'm', 'Mythos', '2026-11-06T10:40:00Z'),
  session('s2', 'h', 'Heroes', '2026-11-05T19:15:00Z', { startTime: 0, currentTime: 600, timeListening: 600 }),
  session('s3', 'm', 'Mythos', '2026-11-02T08:00:00Z', { deviceInfo: null }),
];

const STATS = {
  totalTime: 100_000,
  today: 0,
  // Mon 2 Nov 4h, Thu 5 Nov 2h12m: 6h 12m this week; 31 Oct is the week before.
  days: { '2026-10-31': 5 * 3600, '2026-11-02': 4 * 3600, '2026-11-05': 2 * 3600 + 12 * 60 },
  items: {
    m: { id: 'm', timeListening: 7200, mediaMetadata: { title: 'Mythos', authors: [{ name: 'Stephen Fry' }] } },
    h: { id: 'h', timeListening: 3600, mediaMetadata: { title: 'Heroes', authors: [{ name: 'Stephen Fry' }] } },
  },
};

interface Fixture {
  sessions?: object;
  stats?: object;
  finished?: object;
  me?: object;
  fail?: RegExp;
}

function serve(f: Fixture = {}) {
  absFetch.mockImplementation((path: string) => {
    if (f.fail?.test(path)) return Promise.reject(new auth.AbsError(500, 'boom'));
    const u = new URL(path, 'http://x');
    if (path === '/api/libraries') return Promise.resolve({ libraries: [{ id: 'L1', name: 'Fiction', mediaType: 'book' }] });
    if (path === '/api/me')
      return Promise.resolve(
        f.me ?? { mediaProgress: [{ libraryItemId: 'sand', progress: 1, isFinished: true, finishedAt: Date.parse('2026-10-03T12:00:00Z') }] },
      );
    if (u.pathname === '/api/me/listening-sessions') return Promise.resolve(f.sessions ?? page(SESSIONS));
    if (u.pathname.startsWith('/api/me/item/listening-sessions'))
      return Promise.resolve(f.sessions ?? page(SESSIONS.filter((s) => s.libraryItemId === 'm')));
    if (u.pathname === '/api/me/listening-stats') return Promise.resolve(f.stats ?? STATS);
    if (u.pathname === '/api/items/m') return Promise.resolve(book('m', 'Mythos'));
    if (u.pathname === '/api/items/h') return Promise.resolve(book('h', 'Heroes', []));
    if (u.pathname === '/api/libraries/L1/items')
      return Promise.resolve(
        f.finished ?? {
          results: [{ id: 'sand', updatedAt: 1, media: { metadata: { title: 'The Sandman: Act II', authorName: 'Neil Gaiman' } } }],
          total: 1,
          limit: 48,
          page: 0,
        },
      );
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/history" element={<History />}>
            <Route index element={<HistoryLog />} />
            <Route path="finished" element={<HistoryFinished />} />
            <Route path="stats" element={<HistoryStats />} />
          </Route>
          <Route path="/book/:id" element={<Book />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  process.env.TZ = 'Europe/London';
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('REQ-49 the History page and its tabs', () => {
  it('shows the Log first, then moves between Log, Finished and Stats at their own URLs', async () => {
    serve();
    renderAt('/history');
    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'History sections' }));
    expect(tabs.getByRole('link', { name: 'Log' })).toHaveAttribute('aria-current', 'page');
    await screen.findByText('Today');

    await userEvent.click(tabs.getByRole('link', { name: 'Finished' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/history/finished');
    expect(tabs.getByRole('link', { name: 'Finished' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(tabs.getByRole('link', { name: 'Stats' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/history/stats');
  });
});

describe('REQ-50 REQ-51 REQ-56 the log', () => {
  it('groups by local day, newest first, with chapter range, time listened and device', async () => {
    serve();
    renderAt('/history');
    const today = (await screen.findByRole('heading', { name: /^Today/ })).closest('section') as HTMLElement;
    const row = await within(today).findByRole('link', { name: /Mythos/ });
    await waitFor(() => expect(row).toHaveTextContent('Ch 2 → Ch 3'));
    expect(row).toHaveTextContent('10:40');
    expect(row).toHaveTextContent('48 min');
    expect(row).toHaveTextContent('iPhone · Storyshelf');

    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(heads.slice(0, 3)).toEqual(['Today48 min', 'Yesterday10 min', 'Mon 2 Nov48 min']);
  });

  it('falls back to a time range for a book with no chapters, and skips a missing device', async () => {
    serve();
    renderAt('/history');
    const yesterday = (await screen.findByRole('heading', { name: /^Yesterday/ })).closest('section') as HTMLElement;
    const row = await within(yesterday).findByRole('link', { name: /Heroes/ });
    await waitFor(() => expect(row).toHaveTextContent('0:00:00 → 0:10:00'));
    const old = (await screen.findByRole('heading', { name: /^Mon 2 Nov/ })).closest('section') as HTMLElement;
    expect(within(old).getByRole('link', { name: /Mythos/ })).not.toHaveTextContent('Storyshelf');
  });

  it('opens the book when a row is clicked', async () => {
    serve();
    renderAt('/history');
    const today = (await screen.findByRole('heading', { name: /^Today/ })).closest('section') as HTMLElement;
    await userEvent.click(await within(today).findByRole('link', { name: /Mythos/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/book/m');
  });

  it('asks for sessions a page at a time and lists only books', async () => {
    serve({ sessions: page([...SESSIONS, session('p1', 'pod', 'A podcast', '2026-11-06T09:00:00Z', { mediaType: 'podcast' })]) });
    renderAt('/history');
    await screen.findByText('Today');
    expect(absFetch.mock.calls.map((c) => c[0])).toContain('/api/me/listening-sessions?itemsPerPage=30&page=0');
    expect(screen.queryByText('A podcast')).not.toBeInTheDocument();
  });
});

describe('REQ-57 empty and error states', () => {
  it('invites a new account to press play', async () => {
    serve({ sessions: page([], { total: 0, numPages: 0 }) });
    renderAt('/history');
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument();
    expect(screen.getByText(/Press play on a book/)).toBeInTheDocument();
  });

  it('offers a retry when the log fails, and recovers', async () => {
    serve({ fail: /listening-sessions/ });
    renderAt('/history');
    const retry = await screen.findByRole('button', { name: 'Try again' });
    serve();
    await userEvent.click(retry);
    expect(await screen.findByText('Today')).toBeInTheDocument();
  });

  it('shows an empty Finished list and a failed Stats with a retry', async () => {
    serve({ finished: { results: [], total: 0, limit: 48, page: 0 } });
    renderAt('/history/finished');
    expect(await screen.findByText('No finished books yet')).toBeInTheDocument();
    cleanup();
    serve({ fail: /listening-stats/ });
    renderAt('/history/stats');
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('REQ-52 finished books', () => {
  it('asks ABS for finished books, newest finish first, and shows the finish date', async () => {
    serve();
    renderAt('/history/finished');
    expect(await screen.findByText('The Sandman: Act II')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Finished 3 Oct 2026')).toBeInTheDocument());
    const url = absFetch.mock.calls.map((c) => c[0]).find((p) => p.includes('/api/libraries/L1/items'));
    const qs = new URL(url ?? '', 'http://x').searchParams;
    expect(qs.get('sort')).toBe('progress.finishedAt');
    expect(qs.get('desc')).toBe('1');
    expect(qs.get('filter')).toBe('progress.ZmluaXNoZWQ%3D') // pre-encoded, as ABS decodes it once before the base64;
  });

  it('REQ-51 opens the book from its tile', async () => {
    serve();
    renderAt('/history/finished');
    await userEvent.click(await screen.findByRole('link', { name: /The Sandman: Act II/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/book/sand');
  });
});

describe('log rows', () => {
  it('folds a pause and resume into one row with a time range, and names no device when there is only one', async () => {
    const s = (id: string, at: string, over: object) => session(id, 'm', 'Mythos', at, { timeListening: 240, ...over });
    serve({
      sessions: page([
        s('b', '2026-11-06T18:13:00Z', { startTime: 5000, currentTime: 8000, updatedAt: Date.parse('2026-11-06T18:21:00Z'), timeListening: 480 }),
        s('a', '2026-11-06T18:05:00Z', { startTime: 3700, currentTime: 5000, updatedAt: Date.parse('2026-11-06T18:09:00Z') }),
      ]),
    });
    renderAt('/history');
    const rows = await screen.findAllByRole('link', { name: /Mythos/ });
    expect(rows).toHaveLength(1);
    await waitFor(() => expect(rows[0]).toHaveTextContent('Ch 2 → Ch 3'));
    expect(rows[0]).toHaveTextContent('12 min');
    expect(rows[0]).not.toHaveTextContent('iPhone');
  });
});

describe('REQ-52 finished, empty', () => {
  it('offers a way on to the library', async () => {
    serve({ me: { mediaProgress: [] }, finished: { results: [], total: 0, limit: 48, page: 0 } });
    renderAt('/history/finished');
    await userEvent.click(await screen.findByRole('button', { name: 'Browse your library' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/?library=L1');
  });
});

describe('REQ-53 stats', () => {
  it('totals this week with a Monday start, plus month, year and all time', async () => {
    serve();
    renderAt('/history/stats');
    const stat = async (label: string) => (await screen.findByText(label)).closest('div') as HTMLElement;
    expect(await stat('This week')).toHaveTextContent('6h 12m');
    // The 31 Oct session is last week, but in the year and not in November.
    expect(await stat('This month')).toHaveTextContent('6h 12m');
    expect(await stat('This year')).toHaveTextContent('11h 12m');
    expect(await stat('All time')).toHaveTextContent('27h 47m');
  });

  it('draws the heatmap and ranks top books and authors by time listened', async () => {
    // A listening history older than a fortnight earns the year-long map.
    serve({ stats: { ...STATS, days: { ...STATS.days, '2026-01-05': 600 } } });
    renderAt('/history/stats');
    const map = await screen.findByRole('img', { name: 'Time listened each day over the last year' });
    // 365 cells: look them up by label directly; role queries over every cell take seconds in jsdom.
    expect(map.querySelector('[aria-label="Mon 2 Nov: 4h 00m"]')).not.toBeNull();
    expect(map.querySelector('[aria-label="Today: no listening"]')).not.toBeNull();
    const books = (await screen.findByRole('heading', { name: 'Top books' })).closest('section') as HTMLElement;
    expect(within(books).getByText('Mythos')).toBeInTheDocument();
    expect(within(books).getByText('2h 00m')).toBeInTheDocument();
    const authors = screen.getByRole('heading', { name: 'Top authors' }).closest('section') as HTMLElement;
    expect(within(authors).getByText('Stephen Fry')).toBeInTheDocument();
    expect(within(authors).getByText('3h 00m')).toBeInTheDocument();
  });

  it('starts a new listener with their last seven days, not a year of blank cells', async () => {
    serve();
    renderAt('/history/stats');
    expect(await screen.findByRole('heading', { name: 'Your listening year starts here' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Time listened each day over the last year' })).not.toBeInTheDocument();
    expect(screen.getByText('Mon 2 Nov')).toBeInTheDocument();
  });

  it('shows the nothing-yet state when nothing has been listened to', async () => {
    serve({ stats: { totalTime: 0, today: 0, days: {}, items: {} } });
    renderAt('/history/stats');
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument();
  });
});

describe('REQ-55 Your listening on a book page', () => {
  it('shows started date, time listened, session count and the sessions', async () => {
    serve();
    renderAt('/book/m');
    const section = (await screen.findByRole('heading', { name: 'Your listening' })).closest('section') as HTMLElement;
    // One line, with the sessions behind an expander.
    expect(await within(section).findByText('Started 1 Nov · 2h 00m listened · 2 sessions')).toBeInTheDocument();
    expect(within(section).queryByRole('list')).not.toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Show sessions' }));
    const list = within(section).getByRole('list', { name: 'Sessions, newest first' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveTextContent('Today · 10:40');
    expect(list).toHaveTextContent('Ch 2 → Ch 3');
  });

  it('shows the latest five and a Show all for the rest', async () => {
    const many = Array.from({ length: 9 }, (_, i) => session(`n${i}`, 'm', 'Mythos', `2026-10-${String(20 - i).padStart(2, '0')}T09:00:00Z`));
    serve({ sessions: page(many) });
    renderAt('/book/m');
    const section = (await screen.findByRole('heading', { name: 'Your listening' })).closest('section') as HTMLElement;
    await userEvent.click(await within(section).findByRole('button', { name: 'Show sessions' }));
    expect(await within(section).findAllByRole('listitem')).toHaveLength(5);
    await userEvent.click(within(section).getByRole('button', { name: 'Show all 9 sessions' }));
    expect(within(section).getAllByRole('listitem')).toHaveLength(9);
  });

  it('has no section for a book that was never played', async () => {
    serve({ sessions: page([], { total: 0, numPages: 0 }) });
    absFetch.mockImplementation((path: string) => {
      if (path.startsWith('/api/me/item/listening-sessions')) return Promise.resolve(page([], { total: 0, numPages: 0 }));
      if (path === '/api/me/listening-stats') return Promise.resolve(STATS);
      return Promise.resolve({ ...book('m', 'Mythos'), userMediaProgress: null });
    });
    renderAt('/book/m');
    await screen.findByRole('heading', { level: 1, name: 'Mythos' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your listening' })).not.toBeInTheDocument());
  });
});
