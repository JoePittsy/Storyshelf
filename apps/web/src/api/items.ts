import { queryOptions, useQuery } from '@tanstack/react-query';
import { cleanChapters } from '../player/chapters';
import { AbsError, absFetch } from './auth';
import { absUrl } from './server';

// Only the fields the book page uses, from GET /api/items/:id?expanded=1&include=progress (ABS 2.37).
export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface BookItem {
  id: string;
  /** ABS sends it; the series' books are looked up within it. */
  libraryId?: string;
  updatedAt: number;
  /** Bytes on disk. */
  size?: number;
  media: {
    metadata: {
      title: string;
      subtitle: string | null;
      authors: { id: string; name: string }[];
      narrators: string[];
      series: { id: string; name: string; sequence: string | null }[];
      description: string | null;
      publishedYear: string | null;
      publisher?: string | null;
      genres?: string[];
      language?: string | null;
      isbn?: string | null;
      asin?: string | null;
    };
    duration: number;
    chapters: Chapter[];
  };
  /** null (or absent) when the user hasn't started. */
  userMediaProgress?: {
    currentTime: number;
    progress: number;
    isFinished: boolean;
    startedAt?: number;
    finishedAt?: number | null;
    hideFromContinueListening?: boolean;
  } | null;
}

/** Unauthenticated, so an <img> can load it. Never width 0, which ABS treats as full size. */
export const coverUrl = (id: string, updatedAt: number, width = 800) =>
  absUrl(`/api/items/${id}/cover?width=${width}&format=webp&ts=${updatedAt}`);

export const bookQuery = (id: string) =>
  queryOptions({
    queryKey: ['item', id],
    enabled: !!id,
    queryFn: async () => {
      const item = await absFetch<BookItem>(`/api/items/${encodeURIComponent(id)}?expanded=1&include=progress`);
      return { ...item, media: { ...item.media, chapters: cleanChapters(item.media.chapters) } };
    },
    retry: (count, e) => !(e instanceof AbsError && e.status === 404) && count < 2,
  });

export const useBook = (id: string) => useQuery(bookQuery(id));
