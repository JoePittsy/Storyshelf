export interface PlayerSettings {
  /** The default speed: what a book plays at until it is given one of its own (see bookSpeeds). */
  rate: number;
  skipBack: number;
  skipForward: number;
  /** Go back a little when playback resumes after a pause (see rewind). */
  rewindOnResume: boolean;
}

export const DEFAULTS: PlayerSettings = { rate: 1, skipBack: 30, skipForward: 30, rewindOnResume: true };
export const SKIP_OPTIONS = [10, 15, 30, 45, 60];

const KEY = 'storyshelf.player';

const clampRate = (n: number): number => Math.round(Math.min(3, Math.max(0.5, n)) * 10) / 10;
const skipOr = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback;

/** Speed, skip and rewind settings for this device. Storage failures or junk fall back to the defaults. */
export function loadSettings(): PlayerSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof PlayerSettings, unknown>>;
    return {
      rate: typeof raw.rate === 'number' && Number.isFinite(raw.rate) ? clampRate(raw.rate) : DEFAULTS.rate,
      skipBack: skipOr(raw.skipBack, DEFAULTS.skipBack),
      skipForward: skipOr(raw.skipForward, DEFAULTS.skipForward),
      rewindOnResume: typeof raw.rewindOnResume === 'boolean' ? raw.rewindOnResume : DEFAULTS.rewindOnResume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: PlayerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage blocked: settings last for this page only.
  }
}

export { clampRate };
