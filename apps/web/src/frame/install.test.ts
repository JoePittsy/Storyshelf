// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { installRoute, listenForInstall, offersInstall, resetInstallForTests, useInstall } from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const env = (userAgent: string, extra: Partial<Parameters<typeof installRoute>[0]> = {}) => ({
  standalone: false,
  canPrompt: false,
  userAgent,
  maxTouchPoints: 0,
  ...extra,
});

describe('installRoute', () => {
  it('offers nothing once running as an installed app', () => {
    expect(installRoute(env(IPHONE, { standalone: true, maxTouchPoints: 5 }))).toBe('installed');
    expect(installRoute(env(MAC_CHROME, { standalone: true, canPrompt: true }))).toBe('installed');
  });
  it("uses the browser's own dialog whenever it has offered one", () => {
    expect(installRoute(env(MAC_CHROME, { canPrompt: true }))).toBe('prompt');
  });
  it('explains Share > Add to Home Screen on iPhone, in Safari or another browser', () => {
    expect(installRoute(env(IPHONE, { maxTouchPoints: 5 }))).toBe('ios');
    expect(installRoute(env(IPHONE_CHROME, { maxTouchPoints: 5 }))).toBe('ios');
  });
  it('tells an iPad, which reports itself as a Mac, by its touch points', () => {
    expect(installRoute(env(MAC, { maxTouchPoints: 5 }))).toBe('ios');
  });
  it("points Mac Safari at its menu, and leaves other browsers that can't install alone", () => {
    expect(installRoute(env(MAC))).toBe('mac-safari');
    expect(installRoute(env(MAC_CHROME))).toBe('none'); // Chromium that hasn't offered (yet)
    expect(installRoute(env(FIREFOX))).toBe('none');
  });
  it('shows the App card only for routes it can act on', () => {
    expect(['prompt', 'ios', 'mac-safari', 'installed', 'none'].map((r) => offersInstall(r as never))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('the install prompt', () => {
  afterEach(() => {
    resetInstallForTests();
    vi.restoreAllMocks();
  });

  const offer = (outcome: 'accepted' | 'dismissed') => {
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(() => Promise.resolve()),
      userChoice: Promise.resolve({ outcome }),
    });
    act(() => void window.dispatchEvent(e));
    return e;
  };

  it("keeps Chromium's offer, replays it from the button once, then drops it", async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MAC_CHROME);
    listenForInstall(window);
    const { result } = renderHook(() => useInstall());
    expect(result.current.route).toBe('none');

    const e = offer('accepted');
    expect(e.defaultPrevented).toBe(true); // the browser's own infobar stays away
    expect(result.current.route).toBe('prompt');

    let accepted = false;
    await act(async () => void (accepted = await result.current.promptInstall()));
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(true);
    expect(result.current.route).toBe('none');
  });

  it('counts the app as installed once the browser says so', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MAC_CHROME);
    listenForInstall(window);
    const { result } = renderHook(() => useInstall());
    offer('dismissed');
    act(() => void window.dispatchEvent(new Event('appinstalled')));
    expect(result.current.route).toBe('installed');
  });
});
