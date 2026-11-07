// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { itemsUrl } from './libraries';
import {
  DEFAULT_LIBRARY_SORT,
  SORT_CHOICES,
  choiceOf,
  parseSortParams,
  resolveSort,
  sortStoreKey,
  storeSort,
  storedSort,
  writeSort,
} from './sort';

const qs = (s: string) => new URLSearchParams(s);

afterEach(() => localStorage.clear());

describe('sort choices', () => {
  it('offers each useful ABS sort, both ways where that makes sense, with unique labels', () => {
    const labels = SORT_CHOICES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    const pairs = SORT_CHOICES.map((c) => `${c.key}:${c.desc ? 'desc' : 'asc'}`);
    expect(pairs).toEqual([
      'addedAt:desc',
      'addedAt:asc',
      'progress:desc',
      'media.metadata.title:asc',
      'media.metadata.title:desc',
      'media.metadata.authorNameLF:asc',
      'media.metadata.authorNameLF:desc',
      'media.metadata.authorName:asc',
      'media.metadata.authorName:desc',
      'media.metadata.publishedYear:desc',
      'media.metadata.publishedYear:asc',
      'media.duration:asc',
      'media.duration:desc',
    ]);
  });
  it('labels are sentence case', () => {
    for (const c of SORT_CHOICES) expect(c.label[0]).toBe(c.label[0]?.toUpperCase());
  });
  it('defaults to recently added, as before', () => {
    expect(DEFAULT_LIBRARY_SORT).toEqual({ key: 'addedAt', desc: true });
  });
});

describe('parseSortParams', () => {
  it('reads an old link with only a sort key, in that field’s usual direction', () => {
    expect(parseSortParams(qs('sort=media.metadata.title'))).toEqual({ key: 'media.metadata.title', desc: false });
    expect(parseSortParams(qs('sort=progress'))).toEqual({ key: 'progress', desc: true });
    expect(parseSortParams(qs('sort=addedAt'))).toEqual({ key: 'addedAt', desc: true });
  });
  it('reads an explicit direction', () => {
    expect(parseSortParams(qs('sort=media.metadata.title&desc=1'))).toEqual({
      key: 'media.metadata.title',
      desc: true,
    });
    expect(parseSortParams(qs('sort=addedAt&desc=0'))).toEqual({ key: 'addedAt', desc: false });
    expect(parseSortParams(qs('sort=media.duration&desc=1'))).toEqual({ key: 'media.duration', desc: true });
  });
  it('falls back to the default for no sort or one it does not know', () => {
    expect(parseSortParams(qs(''))).toEqual(DEFAULT_LIBRARY_SORT);
    expect(parseSortParams(qs('sort=nonsense&desc=0'))).toEqual(DEFAULT_LIBRARY_SORT);
    expect(parseSortParams(qs('sort=random'))).toEqual(DEFAULT_LIBRARY_SORT);
  });
  it('ignores a direction a field does not offer (recently listened is newest first only)', () => {
    expect(parseSortParams(qs('sort=progress&desc=0'))).toEqual({ key: 'progress', desc: true });
  });
  it('treats a junk direction as the field’s usual one', () => {
    expect(parseSortParams(qs('sort=media.metadata.title&desc=yes'))).toEqual({
      key: 'media.metadata.title',
      desc: false,
    });
  });
});

describe('writeSort', () => {
  it('writes the key, and the direction only when it is not the field’s usual one', () => {
    expect(writeSort(qs('library=L1'), { key: 'media.metadata.title', desc: false }).toString()).toBe(
      'library=L1&sort=media.metadata.title'
    );
    expect(writeSort(qs('library=L1'), { key: 'media.metadata.title', desc: true }).toString()).toBe(
      'library=L1&sort=media.metadata.title&desc=1'
    );
    expect(writeSort(qs('sort=addedAt'), { key: 'addedAt', desc: false }).toString()).toBe('sort=addedAt&desc=0');
  });
  it('drops a stale direction and keeps other parameters, without touching its input', () => {
    const before = qs('library=L1&genre=Horror&sort=media.duration&desc=1&q=x');
    const after = writeSort(before, { key: 'addedAt', desc: true });
    expect(after.toString()).toBe('library=L1&genre=Horror&sort=addedAt&q=x');
    expect(before.get('desc')).toBe('1');
  });
  it('round-trips every choice', () => {
    for (const c of SORT_CHOICES) {
      expect(parseSortParams(writeSort(qs(''), c))).toEqual({ key: c.key, desc: c.desc });
    }
  });
});

describe('choiceOf', () => {
  it('finds the choice for a sort, for the select', () => {
    expect(choiceOf({ key: 'media.duration', desc: true }).label).toBe('Longest');
    expect(choiceOf({ key: 'addedAt', desc: true }).label).toBe('Recently added');
  });
  it('gives distinct values that map back to their sort', () => {
    const values = SORT_CHOICES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('remembered per library', () => {
  it('stores the last sort per library and forgets it when the default is chosen', () => {
    storeSort('L1', { key: 'media.duration', desc: true });
    storeSort('L2', { key: 'media.metadata.title', desc: false });
    expect(storedSort('L1')).toEqual({ key: 'media.duration', desc: true });
    expect(storedSort('L2')).toEqual({ key: 'media.metadata.title', desc: false });
    storeSort('L1', DEFAULT_LIBRARY_SORT);
    expect(localStorage.getItem(sortStoreKey('L1'))).toBeNull();
    expect(storedSort('L1')).toBeNull();
  });
  it('ignores junk in storage', () => {
    localStorage.setItem(sortStoreKey('L1'), 'sort=nonsense');
    expect(storedSort('L1')).toBeNull();
  });
  it('the URL wins; a URL with no sort takes the library’s remembered one, else the default', () => {
    storeSort('L1', { key: 'media.duration', desc: false });
    expect(resolveSort(qs('sort=media.metadata.title'), 'L1')).toEqual({ key: 'media.metadata.title', desc: false });
    expect(resolveSort(qs('genre=Horror'), 'L1')).toEqual({ key: 'media.duration', desc: false });
    expect(resolveSort(qs(''), 'L2')).toEqual(DEFAULT_LIBRARY_SORT);
    expect(resolveSort(qs(''), undefined)).toEqual(DEFAULT_LIBRARY_SORT);
  });
});

describe('itemsUrl with a direction', () => {
  it('sends the chosen direction to ABS', () => {
    const u = new URL(itemsUrl('L1', 'media.duration', 0, undefined, true), 'http://x');
    expect(u.searchParams.get('sort')).toBe('media.duration');
    expect(u.searchParams.get('desc')).toBe('1');
    const t = new URL(itemsUrl('L1', 'media.metadata.publishedYear', 0, undefined, false), 'http://x');
    expect(t.searchParams.get('desc')).toBe('0');
  });
  it('keeps each field’s usual direction when none is given', () => {
    expect(new URL(itemsUrl('L1', 'addedAt', 0), 'http://x').searchParams.get('desc')).toBe('1');
    expect(new URL(itemsUrl('L1', 'media.metadata.title', 0), 'http://x').searchParams.get('desc')).toBe('0');
  });
});
