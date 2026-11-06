import { useQuery } from '@tanstack/react-query';
import { absFetch } from './auth';
import { absFilter } from './libraries';
import type { LibraryItem, Progress } from './libraries';

/** What the user has asked to narrow the library by. Empty string / false = not set. */
export interface Filters {
  genre: string;
  /** One of PROGRESS_OPTIONS' values, or ''. */
  progress: string;
  lang: string;
  tag: string;
  publisher: string;
  /** A decade's first year, e.g. "1980". */
  decade: string;
  abridged: boolean;
  /** Has an ebook file. */
  ebook: boolean;
}

export const NO_FILTERS: Filters = {
  genre: '',
  progress: '',
  lang: '',
  tag: '',
  publisher: '',
  decade: '',
  abridged: false,
  ebook: false,
};

export type FilterKey = keyof Filters;

/** URL parameter per filter. */
export const FILTER_PARAMS: Record<FilterKey, string> = {
  genre: 'genre',
  progress: 'progress',
  lang: 'lang',
  tag: 'tag',
  publisher: 'publisher',
  decade: 'decade',
  abridged: 'abridged',
  ebook: 'ebook',
};

export const PROGRESS_OPTIONS = [
  { value: 'hide-finished', label: 'Hide finished', abs: 'not-finished' },
  { value: 'in-progress', label: 'In progress', abs: 'in-progress' },
  { value: 'not-started', label: 'Not started', abs: 'not-started' },
  { value: 'finished', label: 'Finished', abs: 'finished' },
] as const;

const KEYS = Object.keys(NO_FILTERS) as FilterKey[];

const isOn = (f: Filters, k: FilterKey): boolean => !!f[k];

export const activeKeys = (f: Filters): FilterKey[] => KEYS.filter((k) => isOn(f, k));
export const countActive = (f: Filters): number => activeKeys(f).length;

/** Filters from URL parameters. An unknown progress value is dropped. */
export function parseFilters(params: URLSearchParams): Filters {
  const text = (k: FilterKey) => params.get(FILTER_PARAMS[k])?.trim() ?? '';
  const progress = text('progress');
  return {
    genre: text('genre'),
    progress: PROGRESS_OPTIONS.some((o) => o.value === progress) ? progress : '',
    lang: text('lang'),
    tag: text('tag'),
    publisher: text('publisher'),
    decade: /^\d{3,4}$/.test(text('decade')) ? text('decade') : '',
    abridged: text('abridged') === '1',
    ebook: text('ebook') === '1',
  };
}

/** A copy of `params` with its filter parameters replaced by `f`'s. Other parameters (library, sort, q) are kept. */
export function writeFilters(params: URLSearchParams, f: Filters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const k of KEYS) {
    next.delete(FILTER_PARAMS[k]);
    const v = f[k];
    if (v) next.set(FILTER_PARAMS[k], v === true ? '1' : v);
  }
  return next;
}

export const hasFilterParams = (params: URLSearchParams): boolean => countActive(parseFilters(params)) > 0;

// --- Server filter: ABS takes one `filter=group.<base64>` per request. -------------------------------------------

/** The filter sent to ABS, most selective first. The rest are applied here. */
export const SERVER_PRIORITY: FilterKey[] = ['genre', 'tag', 'publisher', 'lang', 'decade', 'progress', 'ebook', 'abridged'];

export function serverKey(f: Filters): FilterKey | null {
  return SERVER_PRIORITY.find((k) => isOn(f, k)) ?? null;
}

/** The `filter` query value for ABS, or undefined when nothing is filtered server-side. */
export function serverFilterValue(f: Filters): string | undefined {
  switch (serverKey(f)) {
    case 'genre':
      return absFilter('genres', f.genre);
    case 'tag':
      return absFilter('tags', f.tag);
    case 'publisher':
      return absFilter('publishers', f.publisher);
    case 'lang':
      return absFilter('languages', f.lang);
    case 'decade':
      return absFilter('publishedDecades', f.decade);
    case 'progress':
      return absFilter('progress', PROGRESS_OPTIONS.find((o) => o.value === f.progress)?.abs ?? '');
    case 'ebook':
      return absFilter('ebooks', 'ebook');
    case 'abridged':
      return absFilter('abridged', 'abridged'); // ABS ignores the value
    default:
      return undefined;
  }
}

/** The filters still to apply to results: everything except the one ABS handled. */
export function clientFilters(f: Filters, handledByServer: boolean): Filters {
  const k = handledByServer ? serverKey(f) : null;
  return k ? { ...f, [k]: NO_FILTERS[k] } : f;
}

// --- Client predicate --------------------------------------------------------------------------------------------

const same = (a: string | null | undefined, b: string): boolean =>
  (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
const has = (list: string[] | null | undefined, v: string): boolean => (list ?? []).some((x) => same(x, v));

/** Whether a book passes every filter set in `f`. Missing metadata never matches a filter that needs it. */
export function matchesFilters(item: LibraryItem, f: Filters, progress: Map<string, Progress>): boolean {
  const m = item.media.metadata;
  if (f.genre && !has(m.genres, f.genre)) return false;
  if (f.tag && !has(item.media.tags, f.tag)) return false;
  if (f.publisher && !same(m.publisher, f.publisher)) return false;
  if (f.lang && !same(m.language, f.lang)) return false;
  if (f.decade) {
    const year = parseInt(m.publishedYear ?? '', 10);
    if (!Number.isFinite(year) || Math.floor(year / 10) * 10 !== parseInt(f.decade, 10)) return false;
  }
  if (f.abridged && m.abridged !== true) return false;
  if (f.ebook && !item.media.ebookFormat) return false;
  if (f.progress) {
    const p = progress.get(item.id);
    const finished = p?.isFinished ?? false;
    const started = !finished && (p?.progress ?? 0) > 0;
    if (f.progress === 'hide-finished' && finished) return false;
    if (f.progress === 'finished' && !finished) return false;
    if (f.progress === 'in-progress' && !started) return false;
    if (f.progress === 'not-started' && (finished || started)) return false;
  }
  return true;
}

// --- Per-library memory ------------------------------------------------------------------------------------------

export const filtersStoreKey = (libraryId: string): string => `storyshelf.filters.${libraryId}`;

/** The filters last used in this library on this device, or none. Storage may be blocked or hold junk. */
export function storedFilters(libraryId: string): Filters {
  try {
    const raw = localStorage.getItem(filtersStoreKey(libraryId));
    return raw ? parseFilters(new URLSearchParams(raw)) : NO_FILTERS;
  } catch {
    return NO_FILTERS;
  }
}

/** Remembers `f` for the library; clearing all filters forgets them. */
export function storeFilters(libraryId: string, f: Filters): void {
  try {
    const key = filtersStoreKey(libraryId);
    if (countActive(f) === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, writeFilters(new URLSearchParams(), f).toString());
  } catch {
    // Storage blocked: the URL still carries the filters.
  }
}

/** The URL's filters win; only a URL with none falls back to the library's remembered set. */
export function resolveFilters(params: URLSearchParams, libraryId: string): Filters {
  return hasFilterParams(params) ? parseFilters(params) : storedFilters(libraryId);
}

// --- Chips ---------------------------------------------------------------------------------------------------------

export function chipLabel(f: Filters, k: FilterKey): string {
  switch (k) {
    case 'genre':
      return `Genre: ${f.genre}`;
    case 'progress':
      return `Progress: ${PROGRESS_OPTIONS.find((o) => o.value === f.progress)?.label ?? f.progress}`;
    case 'lang':
      return `Language: ${f.lang}`;
    case 'tag':
      return `Tag: ${f.tag}`;
    case 'publisher':
      return `Publisher: ${f.publisher}`;
    case 'decade':
      return `Published: ${f.decade}s`;
    case 'abridged':
      return 'Abridged';
    case 'ebook':
      return 'Has an ebook';
  }
}

// --- Options from ABS ----------------------------------------------------------------------------------------------

export interface FilterData {
  genres: string[];
  tags: string[];
  languages: string[];
  publishers: string[];
  publishedDecades: string[];
}

export const filterDataUrl = (libraryId: string): string => `/api/libraries/${libraryId}/filterdata`;

export const useFilterData = (libraryId: string | undefined) =>
  useQuery({
    queryKey: ['filterdata', libraryId],
    enabled: !!libraryId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FilterData> => {
      const d = await absFetch<Partial<FilterData>>(filterDataUrl(libraryId ?? ''));
      return {
        genres: d.genres ?? [],
        tags: d.tags ?? [],
        languages: d.languages ?? [],
        publishers: d.publishers ?? [],
        publishedDecades: d.publishedDecades ?? [],
      };
    },
  });

/** Paging: visible books wanted before we stop loading more, and the most extra pages fetched per scroll. */
export const WANT_VISIBLE = 24;
export const MAX_EXTRA_PAGES = 5;
