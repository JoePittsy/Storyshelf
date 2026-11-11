// @vitest-environment jsdom
// The player's volume: remembered on this device, and only offered where a page can set it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let volume: typeof import('./volume');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  volume = await import('./volume');
});
afterEach(() => vi.unstubAllGlobals());

describe('the remembered level', () => {
  it('is full volume until one is chosen', () => {
    expect(volume.loadVolume()).toBe(1);
  });
  it('is kept', () => {
    volume.saveVolume(0.35);
    expect(volume.loadVolume()).toBe(0.35);
  });
  it('junk or an out-of-range level is clamped, or falls back to full', () => {
    localStorage.setItem('storyshelf.volume', '7');
    expect(volume.loadVolume()).toBe(1);
    localStorage.setItem('storyshelf.volume', '-1');
    expect(volume.loadVolume()).toBe(0);
    localStorage.setItem('storyshelf.volume', '{nope');
    expect(volume.loadVolume()).toBe(1);
  });
});

describe('canSetVolume', () => {
  it('true where the element takes the level', () => {
    vi.stubGlobal(
      'Audio',
      class {
        volume = 1;
      }
    );
    expect(volume.canSetVolume()).toBe(true);
  });
  it('false where the setter does nothing, as on iOS', () => {
    vi.stubGlobal(
      'Audio',
      class {
        get volume() {
          return 1;
        }
        set volume(_v: number) {}
      }
    );
    expect(volume.canSetVolume()).toBe(false);
  });
});
