import { describe, expect, it } from 'vitest';
import {
  LIST_PAGE_SIZE,
  collectionUrl,
  collectionsUrl,
  fromCollection,
  fromPlaylist,
  playLabel,
  playTarget,
  playlistUrl,
  playlistsUrl,
  visibleSections,
} from './bookLists';
import type { CollectionResponse, PlaylistResponse } from './bookLists';
import type { Progress } from './libraries';

// Trimmed from ABS 2.37.2: a collection's books and a playlist's items are fully expanded library items.
const expanded = (id: string, title: string, extra: object = {}) => ({
  id,
  mediaType: 'book',
  updatedAt: 7,
  media: {
    duration: 3600,
    audioFiles: [{}],
    chapters: [],
    metadata: { title, authorName: 'Margery Williams', titleIgnorePrefix: title, series: [] },
  },
  ...extra,
});

const collection: CollectionResponse = {
  id: 'c1',
  libraryId: 'L1',
  name: 'Bedtime stories',
  description: 'Short ones.',
  books: [expanded('b3', 'The Velveteen Rabbit'), expanded('b1', 'Copper Beeches'), expanded('b2', 'Peter Rabbit')],
};

const playlist: PlaylistResponse = {
  id: 'p1',
  libraryId: 'L1',
  name: 'Road trip',
  description: null,
  items: [
    { libraryItemId: 'b2', episodeId: null, libraryItem: expanded('b2', 'Peter Rabbit') },
    {
      libraryItemId: 'pod',
      episodeId: 'ep1',
      libraryItem: expanded('pod', 'A podcast', { mediaType: 'podcast' }),
      episode: {},
    },
    { libraryItemId: 'b1', episodeId: null, libraryItem: expanded('b1', 'Copper Beeches') },
    { libraryItemId: 'gone', episodeId: null },
    { libraryItemId: 'pod2', libraryItem: expanded('pod2', 'Another show', { mediaType: 'podcast' }) },
  ],
};

describe('ABS list URLs', () => {
  it('pages a library’s collections and the listener’s playlists', () => {
    const c = new URL(collectionsUrl('L 1', 2), 'http://x');
    expect(c.pathname).toBe('/api/libraries/L%201/collections');
    expect(Object.fromEntries(c.searchParams)).toEqual({ limit: String(LIST_PAGE_SIZE), page: '2' });
    const p = new URL(playlistsUrl('L1', 0, 1), 'http://x');
    expect(p.pathname).toBe('/api/libraries/L1/playlists');
    expect(Object.fromEntries(p.searchParams)).toEqual({ limit: '1', page: '0' });
  });
  it('fetches one collection or playlist by id', () => {
    expect(collectionUrl('c/1')).toBe('/api/collections/c%2F1');
    expect(playlistUrl('p1')).toBe('/api/playlists/p1');
  });
});

describe('fromCollection', () => {
  it('keeps the collection’s own order and the fields the grid needs', () => {
    const list = fromCollection(collection);
    expect(list).toMatchObject({
      id: 'c1',
      name: 'Bedtime stories',
      description: 'Short ones.',
      libraryId: 'L1',
      skipped: 0,
    });
    expect(list.books.map((b) => b.id)).toEqual(['b3', 'b1', 'b2']);
    expect(list.books[0]).toEqual({
      id: 'b3',
      updatedAt: 7,
      media: { duration: 3600, metadata: { title: 'The Velveteen Rabbit', authorName: 'Margery Williams' } },
    });
  });
  it('copes with a collection with no books or no description', () => {
    expect(fromCollection({ id: 'c', libraryId: 'L', name: 'Empty' })).toMatchObject({ books: [], description: null });
  });
});

describe('fromPlaylist', () => {
  it('keeps the books in playlist order, drops podcast episodes (counting them) and items ABS no longer has', () => {
    const list = fromPlaylist(playlist);
    expect(list.books.map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(list.skipped).toBe(2);
    expect(list).toMatchObject({ id: 'p1', name: 'Road trip', description: null, libraryId: 'L1' });
  });
  it('keeps a book once if a playlist lists it twice', () => {
    const items = playlist.items ?? [];
    const twice = { ...playlist, items: [items[0]!, items[2]!, items[0]!] };
    expect(fromPlaylist(twice).books.map((b) => b.id)).toEqual(['b2', 'b1']);
  });
});

describe('visibleSections: entry points only when there is something there', () => {
  const keys = (s: ReturnType<typeof visibleSections>) => s.map((x) => x.key);
  it('hides the row entirely when the library has no collections or playlists', () => {
    expect(visibleSections('books', { collections: 0, playlists: 0 })).toEqual([]);
  });
  it('shows Books plus whichever exist', () => {
    expect(keys(visibleSections('books', { collections: 2, playlists: 0 }))).toEqual(['books', 'collections']);
    expect(keys(visibleSections('books', { collections: 0, playlists: 1 }))).toEqual(['books', 'playlists']);
    expect(keys(visibleSections('books', { collections: 3, playlists: 1 }))).toEqual([
      'books',
      'collections',
      'playlists',
    ]);
  });
  it('leaves out a count that is not known yet (or failed)', () => {
    expect(keys(visibleSections('books', { collections: 2 }))).toEqual(['books', 'collections']);
    expect(visibleSections('books', {})).toEqual([]);
  });
  it('always keeps the section being shown, so a deep link to an empty one still has its tab and a way back', () => {
    expect(keys(visibleSections('collections', { collections: 0, playlists: 0 }))).toEqual(['books', 'collections']);
    expect(keys(visibleSections('playlists', {}))).toEqual(['books', 'playlists']);
  });
  it('links each section with its route', () => {
    expect(visibleSections('books', { collections: 1, playlists: 1 }).map((s) => s.path)).toEqual([
      '/',
      '/collections',
      '/playlists',
    ]);
  });
});

describe('playTarget: Play starts the first unfinished book', () => {
  const books = fromCollection(collection).books; // b3, b1, b2
  const prog = (entries: [string, Partial<Progress>][]) =>
    new Map(entries.map(([id, p]) => [id, { progress: 0, isFinished: false, ...p } as Progress]));

  it('is the first book when nothing has been played', () => {
    expect(playTarget(books, new Map())).toMatchObject({ item: { id: 'b3' }, label: 'Play', from: 0 });
  });
  it('skips finished books, in list order', () => {
    const p = prog([['b3', { isFinished: true, progress: 1 }]]);
    expect(playTarget(books, p)).toMatchObject({ item: { id: 'b1' }, label: 'Play' });
  });
  it('carries on a book already begun from the server’s place', () => {
    const p = prog([
      ['b3', { isFinished: true, progress: 1 }],
      ['b1', { progress: 0.5, currentTime: 1800 }],
    ]);
    const t = playTarget(books, p);
    expect(t).toMatchObject({ item: { id: 'b1' }, label: 'Resume' });
    expect(t?.from).toBeUndefined();
  });
  it('takes the first unfinished even when a later one is in progress', () => {
    const p = prog([['b2', { progress: 0.3, currentTime: 100 }]]);
    expect(playTarget(books, p)).toMatchObject({ item: { id: 'b3' }, label: 'Play' });
  });
  it('goes round again from the top when everything is finished', () => {
    const p = prog(books.map((b) => [b.id, { isFinished: true, progress: 1 }]));
    expect(playTarget(books, p)).toMatchObject({ item: { id: 'b3' }, label: 'Play again', from: 0 });
  });
  it('is nothing for an empty list', () => {
    expect(playTarget([], new Map())).toBeUndefined();
  });

  it('labels the button with the time left when carrying on', () => {
    const p = prog([['b3', { progress: 0.5, currentTime: 1800 }]]);
    expect(playLabel(playTarget(books, p)!, p)).toBe('Resume · 30m left');
    expect(playLabel(playTarget(books, new Map())!, new Map())).toBe('Play');
  });
});
