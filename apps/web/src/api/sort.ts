import { DEFAULT_SORT, SORTS, usualDesc } from './libraries';
import type { SortKey } from './libraries';

/** How the library is sorted: an ABS sort key and a direction. */
export interface LibrarySort {
  key: SortKey;
  desc: boolean;
}

export const DEFAULT_LIBRARY_SORT: LibrarySort = { key: DEFAULT_SORT, desc: usualDesc(DEFAULT_SORT) };

/** One entry in the sort menu. `value` is what the select carries. */
export interface SortChoice extends LibrarySort {
  label: string;
  value: string;
}

const choice = (key: SortKey, desc: boolean, label: string): SortChoice => ({
  key,
  desc,
  label,
  value: `${key}${desc ? ':desc' : ''}`,
});

/**
 * The sort menu: one native select (an iPhone picker wheel), each field both ways where that makes sense. Recently
 * listened only runs newest first, since ABS puts books never played last either way.
 */
export const SORT_CHOICES: readonly SortChoice[] = [
  choice('addedAt', true, 'Recently added'),
  choice('addedAt', false, 'First added'),
  choice('progress', true, 'Recently listened'),
  choice('media.metadata.title', false, 'Title A–Z'),
  choice('media.metadata.title', true, 'Title Z–A'),
  choice('media.metadata.authorNameLF', false, 'Author A–Z'),
  choice('media.metadata.authorNameLF', true, 'Author Z–A'),
  choice('media.metadata.authorName', false, 'Author first name A–Z'),
  choice('media.metadata.authorName', true, 'Author first name Z–A'),
  choice('media.metadata.publishedYear', true, 'Newest published'),
  choice('media.metadata.publishedYear', false, 'Oldest published'),
  choice('media.duration', false, 'Shortest'),
  choice('media.duration', true, 'Longest'),
];

const FIRST = SORT_CHOICES[0] as SortChoice;

const isOffered = (s: LibrarySort): boolean => SORT_CHOICES.some((c) => c.key === s.key && c.desc === s.desc);

/** The menu entry for a sort (the default's when it isn't one). */
export const choiceOf = (s: LibrarySort): SortChoice =>
  SORT_CHOICES.find((c) => c.key === s.key && c.desc === s.desc) ?? FIRST;

/** The sort a menu value stands for. */
export const sortOfChoice = (value: string): LibrarySort => {
  const c = SORT_CHOICES.find((x) => x.value === value) ?? FIRST;
  return { key: c.key, desc: c.desc };
};

/**
 * The sort in URL parameters: `sort` is ABS's key, `desc` (1 or 0) is there only when it isn't the field's usual
 * direction, so an older link with just `sort` still reads as it did. Anything unknown is the default.
 */
export function parseSortParams(params: URLSearchParams): LibrarySort {
  const key = SORTS.find((s) => s.key === params.get('sort'))?.key;
  if (!key) return DEFAULT_LIBRARY_SORT;
  const d = params.get('desc');
  const wanted = { key, desc: d === '1' ? true : d === '0' ? false : usualDesc(key) };
  return isOffered(wanted) ? wanted : { key, desc: usualDesc(key) };
}

/** A copy of `params` with the sort set to `s`. Other parameters (library, filters, q) are kept. */
export function writeSort(params: URLSearchParams, s: LibrarySort): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set('sort', s.key);
  if (s.desc === usualDesc(s.key)) next.delete('desc');
  else next.set('desc', s.desc ? '1' : '0');
  return next;
}

// --- Per-library memory, beside the filters' (filters.ts) -----------------------------------------------------------

export const sortStoreKey = (libraryId: string): string => `storyshelf.sort.${libraryId}`;

/** The sort last chosen in this library on this device, or null. Storage may be blocked or hold junk. */
export function storedSort(libraryId: string): LibrarySort | null {
  try {
    const raw = localStorage.getItem(sortStoreKey(libraryId));
    const params = new URLSearchParams(raw ?? '');
    return raw && SORTS.some((s) => s.key === params.get('sort')) ? parseSortParams(params) : null;
  } catch {
    return null;
  }
}

/** Remembers `s` for the library; choosing the default forgets it. */
export function storeSort(libraryId: string, s: LibrarySort): void {
  try {
    const key = sortStoreKey(libraryId);
    if (s.key === DEFAULT_LIBRARY_SORT.key && s.desc === DEFAULT_LIBRARY_SORT.desc) localStorage.removeItem(key);
    else localStorage.setItem(key, writeSort(new URLSearchParams(), s).toString());
  } catch {
    // Storage blocked: the URL still carries the sort.
  }
}

/** The URL's sort wins; a URL with none takes the library's remembered sort, else the default. */
export function resolveSort(params: URLSearchParams, libraryId: string | undefined): LibrarySort {
  if (params.has('sort') || !libraryId) return parseSortParams(params);
  return storedSort(libraryId) ?? DEFAULT_LIBRARY_SORT;
}
