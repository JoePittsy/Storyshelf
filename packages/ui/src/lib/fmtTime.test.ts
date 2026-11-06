import { describe, expect, it } from 'vitest';
import { fmtTime } from './fmtTime';

describe('fmtTime', () => {
  it('is m:ss under an hour', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(754000)).toBe('12:34');
    expect(fmtTime(3599000)).toBe('59:59');
  });
  it('is h:mm:ss from an hour up', () => {
    expect(fmtTime(3600000)).toBe('1:00:00');
    expect(fmtTime((114 * 60 + 57) * 1000)).toBe('1:54:57');
    expect(fmtTime((13 * 3600 + 41 * 60 + 20) * 1000)).toBe('13:41:20');
  });
  it('clamps negatives to zero', () => {
    expect(fmtTime(-5000)).toBe('0:00');
  });
});
