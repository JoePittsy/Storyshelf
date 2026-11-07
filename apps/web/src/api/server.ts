/**
 * Which ABS server the app talks to, and how.
 *
 * Same-origin mode: the app is served next to ABS (nginx or the Vite proxy), so every path is relative.
 * Hosted mode: the app is a static site and the user types the server's address; every ABS URL is
 * prefixed with it and nothing is sent with cookies (ABS's CORS answer forbids credentialed requests).
 */
import type { ServerStatus } from './types';

export type Mode = 'same-origin' | 'hosted';

const MODE_KEY = 'storyshelf.mode';
const SERVER_KEY = 'storyshelf.server';

let mode: Mode = 'same-origin';
let base = '';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts for this page only.
  }
}

// --- mode detection --------------------------------------------------------------------------

export type ModeProbe = 'abs' | 'other' | 'unreachable';

/** abs: our own origin answered as ABS. other: it answered with something else (a static host). */
export function decideMode(probe: ModeProbe, remembered?: Mode | null): Mode {
  if (probe === 'abs') return 'same-origin';
  if (probe === 'other') return 'hosted';
  return remembered ?? 'same-origin'; // offline at boot: trust what worked last time
}

const isAbsStatus = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && (body as { app?: unknown }).app === 'audiobookshelf';

/** Probes the app's own origin and applies the result. Call once, before rendering. */
export async function detectMode(fetchFn: typeof fetch = fetch): Promise<Mode> {
  let probe: ModeProbe;
  try {
    const res = await fetchFn('/status');
    const body: unknown = await res.json().catch(() => null);
    probe = res.ok && isAbsStatus(body) ? 'abs' : 'other';
  } catch {
    probe = 'unreachable';
  }
  const remembered = read(MODE_KEY);
  const decided = decideMode(probe, remembered === 'hosted' || remembered === 'same-origin' ? remembered : null);
  if (probe !== 'unreachable') write(MODE_KEY, decided);
  setMode(decided);
  return decided;
}

export const getMode = (): Mode => mode;

export function setMode(next: Mode): void {
  mode = next;
  base = next === 'hosted' ? (read(SERVER_KEY) ?? '') : '';
}

// --- server address (hosted mode) -----------------------------------------------------------

/** "abs.example.com/login/" becomes "https://abs.example.com"; null when it can't be an address. */
export function normalizeServerUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const path = u.pathname
    .replace(/\/+$/, '')
    .replace(/\/login$/i, '')
    .replace(/\/+$/, '');
  return `${u.origin}${path}`;
}

export const getServerUrl = (): string | null => (mode === 'hosted' ? read(SERVER_KEY) : null);

export function setServerUrl(url: string | null): void {
  write(SERVER_KEY, url);
  base = url ?? '';
}

/** Turns an ABS path ("/api/...") into the URL to request. The one place the base is applied. */
export const absUrl = (path: string): string => base + path;

// --- probing a typed-in server --------------------------------------------------------------

export type ProbeFailure = 'mixed-content' | 'cors-or-offline' | 'not-abs';

export class ServerProbeError extends Error {
  constructor(public kind: ProbeFailure) {
    super(kind);
    this.name = 'ServerProbeError';
  }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * GETs <url>/status and returns it, or throws ServerProbeError. A fetch that throws a TypeError is
 * either offline, an unreachable host or a CORS block; the browser does not say which, so they share a kind.
 */
export async function probeServer(
  url: string,
  opts: { fetchFn?: typeof fetch; pageProtocol?: string } = {}
): Promise<ServerStatus> {
  const fetchFn = opts.fetchFn ?? fetch;
  const pageProtocol = opts.pageProtocol ?? location.protocol;
  const target = new URL(url);
  if (pageProtocol === 'https:' && target.protocol === 'http:' && !LOOPBACK.has(target.hostname)) {
    throw new ServerProbeError('mixed-content');
  }
  let res: Response;
  try {
    res = await fetchFn(`${url}/status`);
  } catch {
    throw new ServerProbeError('cors-or-offline');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok || !isAbsStatus(body)) throw new ServerProbeError('not-abs');
  return body as ServerStatus;
}

export function resetServerForTests(): void {
  mode = 'same-origin';
  base = '';
}
