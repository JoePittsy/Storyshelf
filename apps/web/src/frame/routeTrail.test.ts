import { describe, expect, it } from 'vitest';
import { backLabel, truncateName } from './routeTrail';

describe('backLabel', () => {
  it('names the list or page the listener came from', () => {
    expect(backLabel('/authors')).toBe('Authors');
    expect(backLabel('/authors?library=lib_1')).toBe('Authors');
    expect(backLabel('/author/au_1')).toBe('Author');
    expect(backLabel('/series')).toBe('Series');
    expect(backLabel('/series/se_1')).toBe('Series');
    expect(backLabel('/narrators')).toBe('Narrators');
    expect(backLabel('/narrator/Rob%20Inglis')).toBe('Narrator');
    expect(backLabel('/history/stats')).toBe('History');
    expect(backLabel('/book/li_1')).toBe('Book');
    expect(backLabel('/collections?library=lib_1')).toBe('Collections');
    expect(backLabel('/collection/co_1')).toBe('Collection');
    expect(backLabel('/playlists')).toBe('Playlists');
    expect(backLabel('/playlist/pl_1')).toBe('Playlist');
  });
  it('is Library for the library itself, a first load or anything unknown', () => {
    expect(backLabel('/')).toBe('Library');
    expect(backLabel('/?library=lib_1&sort=title')).toBe('Library');
    expect(backLabel(null)).toBe('Library');
    expect(backLabel(undefined)).toBe('Library');
    expect(backLabel('/now-playing')).toBe('Library');
  });
});

describe('backLabel with a title', () => {
  it('names a book, author or series by itself', () => {
    expect(backLabel('/book/li_1', 'The Tale of Peter Rabbit')).toBe('The Tale of Peter Rabbit');
    expect(backLabel('/author/au_1', 'Arthur Conan Doyle')).toBe('Arthur Conan Doyle');
    expect(backLabel('/series/se_1', 'Sherlock Holmes')).toBe('Sherlock Holmes');
    expect(backLabel('/collection/co_1', 'Bedtime stories')).toBe('Bedtime stories');
    expect(backLabel('/playlist/pl_1', 'Road trip')).toBe('Road trip');
  });
  it('falls back to the kind when the title is unknown or blank', () => {
    expect(backLabel('/book/li_1', null)).toBe('Book');
    expect(backLabel('/author/au_1', '  ')).toBe('Author');
  });
  it('leaves list pages and the library to their own names', () => {
    expect(backLabel('/authors', 'Ignored')).toBe('Authors');
    expect(backLabel('/', 'Library')).toBe('Library');
  });
  it('truncates a long title to 32 characters', () => {
    const label = backLabel('/book/li_1', 'The Adventures of Sherlock Holmes: The Complete Collection');
    expect(label).toHaveLength(32);
    expect(label.endsWith('…')).toBe(true);
    expect(truncateName('Short')).toBe('Short');
    expect(truncateName('x'.repeat(32))).toBe('x'.repeat(32));
  });
});
