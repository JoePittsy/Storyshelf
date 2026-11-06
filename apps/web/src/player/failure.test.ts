import { describe, expect, it } from 'vitest';
import { formatUnsupported, isRepeatFailure, srcNotSupportedError } from './failure';
import { UnsupportedFormatError } from './session';

const canPlay = (yes: string[]) => (t: string) => (yes.includes(t) ? 'maybe' : '');

describe('formatUnsupported', () => {
  it('blames the format only when the browser says it cannot play the track type', () => {
    expect(formatUnsupported('audio/x-ms-wma', canPlay(['audio/mpeg']))).toBe(true);
    expect(formatUnsupported('audio/mpeg', canPlay(['audio/mpeg']))).toBe(false);
  });
  it('has no evidence without a type', () => {
    expect(formatUnsupported(undefined, canPlay([]))).toBe(false);
    expect(formatUnsupported('', canPlay([]))).toBe(false);
  });
});

describe('srcNotSupportedError', () => {
  it('is the format error for a type the browser cannot play', () => {
    expect(srcNotSupportedError('audio/x-ms-wma', canPlay([]))).toBeInstanceOf(UnsupportedFormatError);
  });
  it('is generic for a playable type: the session track URL died, the format did not', () => {
    expect(srcNotSupportedError('audio/mpeg', canPlay(['audio/mpeg']))).not.toBeInstanceOf(UnsupportedFormatError);
  });
});

describe('isRepeatFailure', () => {
  it('drops a report right behind another, so one failure is one toast', () => {
    expect(isRepeatFailure(1000, 1500)).toBe(true);
    expect(isRepeatFailure(1000, 3500)).toBe(false);
    expect(isRepeatFailure(null, 10)).toBe(false);
  });
});
