import { describe, expect, it } from 'vitest';
import { nextDocked } from './coverDock';

describe('nextDocked', () => {
  it('docks only when fully out of view', () => {
    expect(nextDocked(false, 0)).toBe(true);
    expect(nextDocked(false, 0.01)).toBe(false);
    expect(nextDocked(false, 1)).toBe(false);
  });
  it('undocks only once about half is back', () => {
    expect(nextDocked(true, 0)).toBe(true);
    expect(nextDocked(true, 0.49)).toBe(true);
    expect(nextDocked(true, 0.5)).toBe(false);
    expect(nextDocked(true, 1)).toBe(false);
  });
  it('holds between the thresholds either way', () => {
    expect(nextDocked(false, 0.3)).toBe(false);
    expect(nextDocked(true, 0.3)).toBe(true);
  });
});
