import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { absFetch } from './auth';
import { bookQuery } from './items';
import type { Chapter } from './items';
import { absFilter, withProgressStamp } from './libraries';
import type { LibraryItem } from './libraries';

// Only the ABS fields the history screens use (server v2.37.2: MeController, PlaybackSession, ApiRouter).

export interface SessionDevice {
  /** The client's own id for the device: Storyshelf's is per browser (see player/session.ts). */
  deviceId?: string | null;
  clientName?: string | null;
  /** From the ABS apps. ABS makes up `deviceName` for browsers too ("Windows 10 Chrome"). */
  manufacturer?: string | null;
  deviceName?: string | null;
  model?: string | null;
  osName?: string | null;
  deviceType?: string | null;
  browserName?: string | null;
}

/** One playback session, from GET /api/me/listening-sessions. Times are seconds into the book; stamps are epoch ms. */
export interface ListeningSession {
  id: string;
  /** Null when ABS lost the link (a deleted item). Such a session can be listed but not opened. */
  libraryItemId: string | null;
  mediaType: 'book' | 'podcast';
  displayTitle: string;
  displayAuthor: string | null;
  /** Seconds heard in this session. Can arrive as a string from old data. */
  timeListening: number;
  startTime: number;
  currentTime: number;
  startedAt: number;
  updatedAt: number;
  deviceInfo?: SessionDevice | null;
  /** The book's details as they were when the session opened. Missing from very old sessions. */
  mediaMetadata?: {
    title?: string | null;
    authors?: { id?: string; name?: string | null }[] | null;
    narrators?: (string | null)[] | null;
  } | null;
}

interface SessionsPage {
  sessions: ListeningSession[];
  total: number;
  numPages: number;
  page: number;
  itemsPerPage: number;
}

export const SESSIONS_PER_PAGE = 30;

export const sessionsUrl = (page: number, perPage = SESSIONS_PER_PAGE) =>
  `/api/me/listening-sessions?${new URLSearchParams({ itemsPerPage: String(perPage), page: String(page) }).toString()}`;

/** Books only, with the time listened as a number. */
const clean = (p: SessionsPage): SessionsPage => ({
  ...p,
  sessions: p.sessions
    .filter((s) => s.mediaType !== 'podcast')
    .map((s) => ({ ...s, timeListening: Number(s.timeListening) || 0 })),
});

const nextPage = (last: SessionsPage) => (last.page + 1 < last.numPages ? last.page + 1 : undefined);

/** The whole log, newest first (ABS sorts by last update), a page at a time. */
export const useListeningLog = () =>
  useInfiniteQuery({
    queryKey: ['listening-sessions'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => clean(await absFetch<SessionsPage>(sessionsUrl(pageParam))),
    getNextPageParam: nextPage,
  });

/** Big pages for the year in review: it reads every session back to the year's start. */
const YEAR_PAGE = 500;

/**
 * Every session that could touch `year`. ABS sorts by last update, newest first, so the pages stop at the first one
 * that reaches back before the year began (local time). A past year reads through the years after it to get there.
 */
export const useYearSessions = (year: number) =>
  useQuery({
    queryKey: ['year-sessions', year],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const from = new Date(year, 0, 1).getTime();
      const all: ListeningSession[] = [];
      for (let page = 0; ; page++) {
        const p = clean(await absFetch<SessionsPage>(sessionsUrl(page, YEAR_PAGE)));
        all.push(...p.sessions);
        const oldest = p.sessions[p.sessions.length - 1];
        if (page + 1 >= p.numPages || p.sessions.length === 0 || (oldest && oldest.updatedAt < from)) break;
      }
      return all;
    },
  });

/**
 * GET /api/me/stats/year/:year (ABS 2.26 and later; checked on 2.37.2). Only the finished books are used: the rest is
 * counted from the sessions, which give more (every month, every book's time, every narrator). Its year runs on the
 * server's clock.
 */
export interface YearStats {
  totalListeningTime: number;
  numBooksListened: number;
  numBooksFinished: number;
  longestAudiobookFinished: { id: string; title: string; duration: number; finishedAt: number } | null;
  /** Library item ids, up to five, in no particular order. */
  finishedBooksWithCovers: string[];
}

export const useYearStats = (year: number) =>
  useQuery({
    queryKey: ['year-stats', year],
    staleTime: 5 * 60_000,
    queryFn: () => absFetch<YearStats>(`/api/me/stats/year/${year}`),
  });

/** One book's sessions. The route is paged like the log; 100 covers a book's whole history in practice. */
export const ITEM_SESSIONS_LIMIT = 100;
export const useItemSessions = (libraryItemId: string) =>
  useQuery({
    queryKey: ['item-sessions', libraryItemId],
    enabled: !!libraryItemId,
    queryFn: async () =>
      clean(
        await absFetch<SessionsPage>(
          `/api/me/item/listening-sessions/${encodeURIComponent(libraryItemId)}?itemsPerPage=${ITEM_SESSIONS_LIMIT}&page=0`,
        ),
      ),
  });

export interface ListeningStats {
  totalTime: number;
  /** Seconds per server-local day, "YYYY-MM-DD". Only days with listening. */
  days: Record<string, number>;
  today: number;
  items: Record<
    string,
    {
      id: string;
      timeListening: number;
      mediaMetadata?: { title?: string; authors?: { id?: string; name?: string }[] } | null;
    }
  >;
}

export const useListeningStats = () =>
  useQuery({ queryKey: ['listening-stats'], queryFn: () => absFetch<ListeningStats>('/api/me/listening-stats') });

export interface InProgressItem extends LibraryItem {
  libraryId: string;
  mediaType: string;
  /** Epoch ms of the last progress update; ABS has already sorted by it, newest first. */
  progressLastUpdate: number;
}

/** Unfinished books across every library, most recently played first. */
export const useInProgress = () =>
  useQuery({
    queryKey: ['items-in-progress'],
    queryFn: async () => (await absFetch<{ libraryItems: InProgressItem[] }>('/api/me/items-in-progress?limit=20')).libraryItems,
  });

interface FinishedPage {
  results: LibraryItem[];
  total: number;
  limit: number;
  page: number;
}

const FINISHED_PER_PAGE = 48;

/** Finished books in a library, most recently finished first: ABS's own filter and sort (2.29 and later). */
export const finishedUrl = (libraryId: string, page: number) =>
  `/api/libraries/${libraryId}/items?${new URLSearchParams({
    limit: String(FINISHED_PER_PAGE),
    page: String(page),
    sort: 'progress.finishedAt',
    desc: '1',
    minified: '1',
    filter: absFilter('progress', 'finished'),
  }).toString()}`;

export const useFinished = (libraryId: string | undefined) =>
  useInfiniteQuery({
    queryKey: ['finished', libraryId],
    enabled: !!libraryId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => absFetch<FinishedPage>(withProgressStamp(finishedUrl(libraryId ?? '', pageParam))),
    getNextPageParam: (last) => ((last.page + 1) * last.limit < last.total ? last.page + 1 : undefined),
  });

export interface ChapterInfo {
  state: 'pending' | 'ready' | 'failed';
  chapters: Chapter[];
}

/** Chapters for each book id, from the book page's own cached query, so opening one afterwards costs nothing. */
export function useChapters(ids: string[]): Map<string, ChapterInfo> {
  return useQueries({
    queries: ids.map((id) => ({ ...bookQuery(id), staleTime: 5 * 60_000 })),
    combine: (results) =>
      new Map(
        ids.map((id, i): [string, ChapterInfo] => {
          const r = results[i];
          return [
            id,
            r?.data
              ? { state: 'ready', chapters: r.data.media.chapters }
              : { state: r?.isError ? 'failed' : 'pending', chapters: [] },
          ];
        }),
      ),
  });
}
