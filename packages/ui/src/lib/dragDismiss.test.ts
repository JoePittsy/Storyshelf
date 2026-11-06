import { describe, it, expect } from 'vitest';
import { dismissThreshold, releaseVelocity, shouldDismiss } from './dragDismiss';

describe('dismissThreshold', () => {
  it('is a quarter of the sheet, between 80 and 160px', () => {
    expect(dismissThreshold(200)).toBe(80);
    expect(dismissThreshold(600)).toBe(150);
    expect(dismissThreshold(1000)).toBe(160);
  });
});

describe('releaseVelocity', () => {
  it('is the speed over the last 100ms only', () => {
    const slowThenFast = [
      { y: 0, t: 0 },
      { y: 10, t: 150 },
      { y: 20, t: 250 },
      { y: 60, t: 300 },
    ];
    expect(releaseVelocity(slowThenFast)).toBeCloseTo(0.8); // 40px in 50ms from the 250 sample
  });
  it('reads a finger that stopped before lifting as slow', () => {
    expect(releaseVelocity([{ y: 0, t: 0 }, { y: 100, t: 50 }, { y: 100, t: 300 }])).toBe(0);
  });
  it('is 0 without two samples, and negative when moving up', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ y: 5, t: 1 }])).toBe(0);
    expect(releaseVelocity([{ y: 100, t: 0 }, { y: 60, t: 40 }])).toBeLessThan(0);
  });
});

describe('shouldDismiss', () => {
  const height = 600; // threshold 150
  it('dismisses past the distance threshold even when slow', () => {
    expect(shouldDismiss({ dy: 150, velocity: 0, height })).toBe(true);
    expect(shouldDismiss({ dy: 149, velocity: 0.1, height })).toBe(false);
  });
  it('dismisses a short fast flick', () => {
    expect(shouldDismiss({ dy: 40, velocity: 0.6, height })).toBe(true);
    expect(shouldDismiss({ dy: 40, velocity: 0.49, height })).toBe(false);
  });
  it('ignores a twitch: fast but barely moved', () => {
    expect(shouldDismiss({ dy: 10, velocity: 2, height })).toBe(false);
  });
  it('never dismisses an upward drag, or a pull that is flicked back up', () => {
    expect(shouldDismiss({ dy: -50, velocity: 1, height })).toBe(false);
    expect(shouldDismiss({ dy: 300, velocity: -0.4, height })).toBe(false);
  });
});
