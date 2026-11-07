import { describe, expect, it } from 'vitest';
import type { Chapter } from './chapters';
import { carView } from './carMode';

const chapters: Chapter[] = [
  { id: 0, start: 0, end: 600, title: 'Opening credits' },
  { id: 1, start: 600, end: 1800, title: 'The rabbit hole' },
  // A gap from 1800 to 1900, then the last chapter.
  { id: 2, start: 1900, end: 3000, title: 'A mad tea party' },
];
const base = { position: 900, duration: 3000, chapters, rate: 1 };

describe('carView', () => {
  it('counts down to the end of the current chapter', () => {
    const v = carView(base);
    expect(v.title).toBe('The rabbit hole');
    expect(v.secondsLeft).toBe(900);
    expect(v.progress).toBeCloseTo(0.25);
  });

  it('divides the time left by the speed, so it is the time it will really take', () => {
    expect(carView({ ...base, rate: 1.5 }).secondsLeft).toBe(600);
    expect(carView({ ...base, rate: 0.5 }).secondsLeft).toBe(1800);
  });

  it('never divides by a zero or silly speed', () => {
    expect(carView({ ...base, rate: 0 }).secondsLeft).toBe(900);
    expect(carView({ ...base, rate: Number.NaN }).secondsLeft).toBe(900);
  });

  it('counts to the end of the book when there are no chapters, and names nothing', () => {
    const v = carView({ ...base, chapters: [], position: 1000 });
    expect(v.title).toBeNull();
    expect(v.secondsLeft).toBe(2000);
    expect(v.progress).toBeCloseTo(1000 / 3000);
    expect(v.hasChapters).toBe(false);
  });

  it('in a gap between chapters counts to the next chapter and names none', () => {
    const v = carView({ ...base, position: 1850 });
    expect(v.title).toBeNull();
    expect(v.secondsLeft).toBe(50);
    expect(v.progress).toBeCloseTo(0.5);
  });

  it('falls back to "Chapter N" for a chapter with a blank title', () => {
    const blank = chapters.map((c) => (c.id === 1 ? { ...c, title: '  ' } : c));
    expect(carView({ ...base, chapters: blank }).title).toBe('Chapter 2');
  });

  it('clamps at the ends: nothing left at the end of the book, and progress stays within 0 to 1', () => {
    const end = carView({ ...base, position: 3000 });
    expect(end.secondsLeft).toBe(0);
    expect(end.progress).toBe(1);
    const before = carView({ ...base, position: -5 });
    expect(before.progress).toBe(0);
  });

  it('has nothing to show for a book whose length is not known yet', () => {
    const v = carView({ position: 0, duration: 0, chapters: [], rate: 1 });
    expect(v.secondsLeft).toBe(0);
    expect(v.progress).toBe(0);
  });

  it('knows whether there is a next chapter to go to', () => {
    expect(carView(base).hasNext).toBe(true);
    expect(carView({ ...base, position: 2500 }).hasNext).toBe(false);
    expect(carView({ ...base, chapters: [] }).hasNext).toBe(false);
  });
});
