/**
 * What the installed app needs to open with no network, checked from inside it: the service worker's state, what its
 * caches hold, whether each file this page loaded is among them, and public/boot.js's own start-up log. Shown on the
 * player log page (Settings > About > Diagnostics), to be read on a phone with no inspector.
 */

export const BOOT_LOG_KEY = 'storyshelf.bootlog';

export interface BootEntry {
  t: string;
  ev: string;
  detail?: unknown;
}

/** public/boot.js's log, oldest first. */
export function bootLog(storage: Pick<Storage, 'getItem'> = localStorage): BootEntry[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(BOOT_LOG_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((e): e is BootEntry => !!e && typeof (e as BootEntry).ev === 'string') : [];
  } catch {
    return [];
  }
}

export function clearBootLog(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(BOOT_LOG_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The page's own files: scripts, stylesheets and module preloads, as paths. Plus the page itself and boot.js. */
export function pageFiles(doc: Document = document, origin = location.origin): string[] {
  const nodes = doc.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
    'script[src], link[rel="stylesheet"], link[rel="modulepreload"]'
  );
  const own = [...nodes].map((n) => ('src' in n ? n.src : n.href).replace(origin, ''));
  return [...new Set(['/', '/index.html', '/boot.js', ...own])];
}

interface Deps {
  container?: ServiceWorkerContainer;
  cacheStorage?: CacheStorage;
  files?: string[];
}

/** One line per finding, plain text, to show and to copy. */
export async function checkReadiness(deps: Deps = {}): Promise<string[]> {
  const container = 'container' in deps ? deps.container : navigator.serviceWorker;
  const cacheStorage = 'cacheStorage' in deps ? deps.cacheStorage : globalThis.caches;
  const files = deps.files ?? pageFiles();
  const out: string[] = [];
  const say = (s: string) => out.push(s);

  say(`Browser online: ${navigator.onLine}`);
  if (!container) say('Service worker: not supported here');
  else {
    const c = container.controller;
    say(`Controlling this page: ${c ? `${c.scriptURL.replace(location.origin, '')} (${c.state})` : 'none'}`);
    try {
      const reg = await container.getRegistration('/');
      if (!reg) say('Registration: none');
      else {
        const st = (w: ServiceWorker | null) => (w ? w.state : '-');
        say(`Registration: active ${st(reg.active)}, waiting ${st(reg.waiting)}, installing ${st(reg.installing)}`);
      }
    } catch (e) {
      say(`Registration: check failed (${String(e)})`);
    }
  }
  if (!cacheStorage) {
    say('Cache Storage: not supported here');
    return out;
  }
  try {
    const names = await cacheStorage.keys();
    if (names.length === 0) say('Caches: none');
    for (const name of names) {
      const keys = await (await cacheStorage.open(name)).keys();
      say(`Cache ${name}: ${keys.length} entries`);
    }
  } catch (e) {
    say(`Caches: check failed (${String(e)})`);
  }
  for (const f of files) {
    try {
      const res = await cacheStorage.match(f, { ignoreSearch: true });
      say(
        res
          ? `${f}: cached (${res.status}${res.redirected ? ', redirected' : ''}, ${res.headers.get('content-type') ?? 'no type'})`
          : `${f}: NOT cached`
      );
    } catch (e) {
      say(`${f}: check failed (${String(e)})`);
    }
  }
  return out;
}
