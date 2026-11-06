import { describe, it, expect } from 'vitest';
import { fmtLeft } from './fmtLeft';

describe('fmtLeft', () => {
  it('says hours and minutes from an hour up', () => {
    expect(fmtLeft(8040000)).toBe('2h 14m left');
    expect(fmtLeft(3600000)).toBe('1h 0m left');
  });
  it('says minutes under an hour, rounded down', () => {
    expect(fmtLeft(38 * 60000 + 59000)).toBe('38m left');
    expect(fmtLeft(60000)).toBe('1m left');
  });
  it('says "under a minute" below one minute, and for bad input', () => {
    expect(fmtLeft(59000)).toBe('under a minute left');
    expect(fmtLeft(0)).toBe('under a minute left');
    expect(fmtLeft(-5)).toBe('under a minute left');
    expect(fmtLeft(NaN)).toBe('under a minute left');
  });
});
