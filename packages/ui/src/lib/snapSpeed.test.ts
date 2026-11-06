import { describe, it, expect } from 'vitest';
import { snapSpeed, fmtSpeed } from './snapSpeed';

describe('snapSpeed', () => {
  it('removes float noise', () => {
    expect(snapSpeed(2.0000001, 0.5, 3, 0.1)).toBe(2);
    expect(snapSpeed(1.1 + 0.2, 0.5, 3, 0.1)).toBe(1.3);
  });
  it('rounds to the nearest step', () => {
    expect(snapSpeed(1.26, 0.5, 3, 0.1)).toBe(1.3);
    expect(snapSpeed(1.24, 0.5, 3, 0.1)).toBe(1.2);
    expect(snapSpeed(1.1, 0.5, 3, 0.25)).toBe(1);
  });
  it('clamps to the range', () => {
    expect(snapSpeed(0.1, 0.5, 3, 0.1)).toBe(0.5);
    expect(snapSpeed(9, 0.5, 3, 0.1)).toBe(3);
    expect(snapSpeed(NaN, 0.5, 3, 0.1)).toBe(1);
  });
});

describe('fmtSpeed', () => {
  it('drops trailing zeros', () => {
    expect(fmtSpeed(1)).toBe('1');
    expect(fmtSpeed(1.3)).toBe('1.3');
    expect(fmtSpeed(0.75)).toBe('0.75');
  });
});
