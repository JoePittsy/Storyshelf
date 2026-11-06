import { describe, expect, it } from 'vitest';
import { dockProgress } from './dockProgress';

const H = 200;
const BAR = 50;

describe('dockProgress', () => {
  it('is 0 while the cover is clear of the bar, including the run-in', () => {
    expect(dockProgress(BAR + 400, H, BAR)).toBe(0);
    expect(dockProgress(BAR + 0.25 * H, H, BAR)).toBe(0);
  });
  it('is 1 once the cover is wholly under the bar', () => {
    expect(dockProgress(BAR - H, H, BAR)).toBe(1);
    expect(dockProgress(-1000, H, BAR)).toBe(1);
  });
  it('is linear between, half way at the middle of the run', () => {
    const top = BAR + 0.25 * H - 0.5 * 1.25 * H;
    expect(dockProgress(top, H, BAR)).toBeCloseTo(0.5, 10);
    expect(dockProgress(top + 10, H, BAR)).toBeLessThan(dockProgress(top, H, BAR));
  });
  it('is 0 for an unusable cover', () => {
    expect(dockProgress(0, 0, BAR)).toBe(0);
    expect(dockProgress(NaN, H, BAR)).toBe(0);
  });
});
