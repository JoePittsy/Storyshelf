import { describe, expect, it } from 'vitest';
import { markerAt, markerPercents } from './seekMarkers';
import type { SeekMarker } from './seekMarkers';

const m = (at: number, label = `c${at}`): SeekMarker => ({ at, label });

describe('markerPercents', () => {
  it('maps ms to percent along the bar', () => {
    expect(markerPercents([m(25000), m(50000)], 100000)).toEqual([25, 50]);
  });
  it('skips 0, the end, past the end, and repeats', () => {
    expect(markerPercents([m(0), m(10000), m(10000), m(100000), m(120000)], 100000)).toEqual([10]);
  });
  it('is empty with no markers or no duration', () => {
    expect(markerPercents(undefined, 100)).toEqual([]);
    expect(markerPercents([m(5)], 0)).toEqual([]);
  });
});

describe('markerAt', () => {
  const list = [m(0, 'one'), m(1000, 'two'), m(5000, 'three')];
  it('finds the marker containing the time', () => {
    expect(markerAt(list, 1500)?.label).toBe('two');
  });
  it('takes the later marker exactly on a boundary', () => {
    expect(markerAt(list, 1000)?.label).toBe('two');
  });
  it('holds the last marker after it', () => {
    expect(markerAt(list, 99999)?.label).toBe('three');
  });
  it('is undefined before the first marker', () => {
    expect(markerAt([m(1000, 'two')], 500)).toBeUndefined();
  });
  it('is undefined with an empty list', () => {
    expect(markerAt([], 500)).toBeUndefined();
    expect(markerAt(undefined, 500)).toBeUndefined();
  });
});
