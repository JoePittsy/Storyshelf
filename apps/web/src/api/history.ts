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
