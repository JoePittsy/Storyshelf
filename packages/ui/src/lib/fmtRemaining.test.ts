import { describe, it, expect } from 'vitest';
import { fmtRemaining } from './fmtRemaining';

describe('fmtRemaining', () => {
  it('formats m:ss under an hour', () => {
    expect(fmtRemaining(0)).toBe('0:00');
    expect(fmtRemaining(9000)).toBe('0:09');
    expect(fmtRemaining(750000)).toBe('12:30');
    expect(fmtRemaining(3599000)).toBe('59:59');
  });
  it('formats h:mm:ss from an hour', () => {
    expect(fmtRemaining(3600000)).toBe('1:00:00');
    expect(fmtRemaining(3725000)).toBe('1:02:05');
    expect(fmtRemaining(10 * 3600000)).toBe('10:00:00');
  });
  it('rounds partial seconds up and clamps bad input', () => {
    expect(fmtRemaining(1)).toBe('0:01');
    expect(fmtRemaining(-5000)).toBe('0:00');
    expect(fmtRemaining(NaN)).toBe('0:00');
  });
});
