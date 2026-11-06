import { describe, expect, it } from 'vitest';
import { planScroll } from './scrollRestore';

describe('planScroll', () => {
  it('opens a new page at the top, even if the last one was scrolled', () => {
    expect(planScroll('PUSH', '/', '/book/1', 900)).toEqual({ kind: 'top' });
    expect(planScroll('REPLACE', '/book/1', '/book/2', undefined)).toEqual({ kind: 'top' });
  });
  it('restores the saved position on back and forward', () => {
    expect(planScroll('POP', '/book/1', '/', 900)).toEqual({ kind: 'restore', y: 900 });
  });
  it('goes to the top on back to an entry it never saw', () => {
    expect(planScroll('POP', '/book/1', '/', undefined)).toEqual({ kind: 'top' });
  });
  it('leaves the scroll alone when only the query changes on the same page', () => {
    expect(planScroll('PUSH', '/', '/', 300)).toEqual({ kind: 'keep' });
    expect(planScroll('REPLACE', '/', '/', 300)).toEqual({ kind: 'keep' });
  });
});
