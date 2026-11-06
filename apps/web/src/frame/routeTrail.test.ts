import { describe, expect, it } from 'vitest';
import { backLabel } from './routeTrail';

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
  });
  it('is Library for the library itself, a first load or anything unknown', () => {
    expect(backLabel('/')).toBe('Library');
    expect(backLabel('/?library=lib_1&sort=title')).toBe('Library');
    expect(backLabel(null)).toBe('Library');
    expect(backLabel(undefined)).toBe('Library');
    expect(backLabel('/now-playing')).toBe('Library');
  });
});
