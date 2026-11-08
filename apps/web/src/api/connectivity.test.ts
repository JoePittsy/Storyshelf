// @vitest-environment jsdom
/**
 * Tests for the app-wide connectivity signal: apps/web/src/api/connectivity.ts
 * Offline when a request failed for network reasons or the browser says so; online again on any answer from the server;
 * while offline the server is asked again at once on the browser's online event or on coming back to the screen, and
 * otherwise after a growing wait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  RETRY_DELAYS,
  checkConnection,
  isNetworkError,
  isOffline,
  markReachable,
  markUnreachable,
  resetConnectivityForTests,
  startConnectivity,
  subscribeConnectivity,
  useOffline,
} from './connectivity';

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stop?.();
  stop = undefined;
  resetConnectivityForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const setOnLine = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
const networkError = () => new TypeError('Failed to fetch');

describe('the signal', () => {
  it('starts online', () => {
    expect(isOffline()).toBe(false);
  });

  it('goes offline when a request fails for network reasons, and back online when the server answers', () => {
    const seen: boolean[] = [];
    subscribeConnectivity(() => seen.push(isOffline()));
    markUnreachable();
    expect(isOffline()).toBe(true);
    markReachable();
    expect(isOffline()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it('tells listeners only about changes', () => {
    const cb = vi.fn();
    subscribeConnectivity(cb);
    markUnreachable();
    markUnreachable();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("is offline when the browser starts offline, and the browser's offline event takes it offline", () => {
    setOnLine(false);
    stop = startConnectivity(() => Promise.resolve());
    expect(isOffline()).toBe(true);
    markReachable();
    expect(isOffline()).toBe(false);
    act(() => void dispatchEvent(new Event('offline')));
    expect(isOffline()).toBe(true);
  });

  it("doesn't trust the browser saying it's offline over a server that answers (iOS gets it wrong)", () => {
    setOnLine(false);
    stop = startConnectivity(() => Promise.resolve());
    markReachable();
    expect(isOffline()).toBe(false);
  });

  it('useOffline follows it', () => {
    const { result } = renderHook(() => useOffline());
    expect(result.current).toBe(false);
    act(() => markUnreachable());
    expect(result.current).toBe(true);
    act(() => markReachable());
    expect(result.current).toBe(false);
  });
});

describe('isNetworkError', () => {
  it("counts fetch's TypeError, a timeout and a proxy's 502, 503 and 504 as the server out of reach", () => {
    expect(isNetworkError(networkError())).toBe(true);
    expect(isNetworkError(new DOMException('slow', 'TimeoutError'))).toBe(true);
    for (const status of [502, 503, 504]) expect(isNetworkError({ status })).toBe(true);
  });

  it('does not count an answer from ABS, or a deliberate abort', () => {
    for (const status of [400, 401, 403, 404, 500]) expect(isNetworkError({ status })).toBe(false);
    expect(isNetworkError(new DOMException('stop', 'AbortError'))).toBe(false);
    expect(isNetworkError(new Error('boom'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('asking again', () => {
  it('retries after a growing wait while the server stays out of reach, then once a minute', async () => {
    const probe = vi.fn(() => Promise.reject(networkError()));
    stop = startConnectivity(probe);
    markUnreachable();
    for (const [i, wait] of [...RETRY_DELAYS, 60_000].entries()) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(probe).toHaveBeenCalledTimes(i);
      await vi.advanceTimersByTimeAsync(1);
      expect(probe).toHaveBeenCalledTimes(i + 1);
    }
    expect(isOffline()).toBe(true);
  });

  it('goes online when a check gets through, and stops checking', async () => {
    const probe = vi.fn(() => Promise.resolve());
    stop = startConnectivity(probe);
    markUnreachable();
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0]);
    expect(isOffline()).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('counts any answer from the server as online, even a refusal', async () => {
    stop = startConnectivity(() => Promise.reject(Object.assign(new Error('Session expired'), { status: 401 })));
    markUnreachable();
    await checkConnection();
    expect(isOffline()).toBe(false);
  });

  it("checks at once on the browser's online event, without waiting for the timer", async () => {
    const probe = vi.fn(() => Promise.resolve());
    stop = startConnectivity(probe);
    markUnreachable();
    dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(isOffline()).toBe(false);
  });

  it('checks at once when the app comes back to the screen while offline', async () => {
    const probe = vi.fn(() => Promise.reject(networkError()));
    stop = startConnectivity(probe);
    markUnreachable();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('does not check on coming back to the screen while online', async () => {
    const probe = vi.fn(() => Promise.resolve());
    stop = startConnectivity(probe);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).not.toHaveBeenCalled();
  });

  it('runs one check at a time', async () => {
    let release: () => void = () => undefined;
    const probe = vi.fn(
      () =>
        new Promise<void>((res) => {
          release = res;
        })
    );
    stop = startConnectivity(probe);
    markUnreachable();
    const a = checkConnection();
    const b = checkConnection();
    expect(probe).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b]);
    expect(isOffline()).toBe(false);
  });
});
