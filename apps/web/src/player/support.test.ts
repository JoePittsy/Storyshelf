import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supportedMimeTypes } from './mime';
import { DEFAULTS, loadSettings, saveSettings } from './settings';

describe('supportedMimeTypes', () => {
  it('REQ-21: keeps only the types canPlayType does not answer with an empty string', () => {
    const el = { canPlayType: (t: string) => (t === 'audio/mpeg' ? 'probably' : t === 'audio/mp4' ? 'maybe' : '') };
    expect(supportedMimeTypes(el), 'Expected only mpeg and mp4').toEqual(['audio/mpeg', 'audio/mp4']);
  });

  it('REQ-21: an element that plays nothing gives an empty list', () => {
    expect(supportedMimeTypes({ canPlayType: () => '' })).toEqual([]);
  });
});

describe('player settings', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    });
  });

  it('REQ-19: defaults are 1.0x and 30 s skips', () => {
    expect(loadSettings(), 'Expected defaults when nothing is stored').toEqual(DEFAULTS);
  });

  it('REQ-19: a saved rate comes back for the next book', () => {
    saveSettings({ ...DEFAULTS, rate: 1.3 });
    expect(loadSettings().rate, 'Expected 1.3x to be remembered').toBe(1.3);
  });

  it('REQ-17: a saved back-skip of 15 comes back', () => {
    saveSettings({ ...DEFAULTS, skipBack: 15 });
    expect(loadSettings().skipBack).toBe(15);
    expect(loadSettings().skipForward, 'Expected forward skip to stay at the default').toBe(30);
  });

  it('rewinding after a pause is on until it is turned off, and that sticks', () => {
    expect(loadSettings().rewindOnResume).toBe(true);
    saveSettings({ ...DEFAULTS, rewindOnResume: false });
    expect(loadSettings().rewindOnResume).toBe(false);
  });

  it('REQ-19: a stored rate outside 0.5-3 is clamped, and junk falls back to defaults', () => {
    localStorage.setItem(
      'storyshelf.player',
      JSON.stringify({ rate: 9, skipBack: -4, skipForward: 'x', rewindOnResume: 'no' })
    );
    expect(loadSettings(), 'Expected rate 3 and default skips').toEqual({
      rate: 3,
      skipBack: 30,
      skipForward: 30,
      rewindOnResume: true,
    });
    localStorage.setItem('storyshelf.player', 'not json');
    expect(loadSettings()).toEqual(DEFAULTS);
  });

  it('REQ-19: storage that throws gives defaults and does not throw on save', () => {
    const boom = () => {
      throw new DOMException('no', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom });
    expect(loadSettings()).toEqual(DEFAULTS);
    expect(() => saveSettings(DEFAULTS)).not.toThrow();
  });
});
