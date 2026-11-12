import type { E2EEnv } from './env';

/** A book as the suite needs to know it, from ABS's minified library item. */
export interface Book {
  id: string;
  title: string;
  /** Seconds. */
  duration: number;
  chapters: number;
  narrator: string;
}

/** The known state the suite puts the user in before each test. */
export interface Seed {
  /** In progress and the most recently played: the Library's resume hero. */
  hero: Book;
  /** In progress, played before the hero: on the Continue listening shelf. */
  other: Book;
  /** Where the hero was left, in seconds. */
  heroAt: number;
  /** Not started, so a "Recently added" tile (every other book, newest first by ABS's order). */
  unstarted: Book[];
  /** A book with a narrator (its `narrator` field), for the search test. */
  narrated: Book;
}

interface Item {
  id: string;
  media: { duration?: number; numChapters?: number; metadata: { title: string; narratorName?: string } };
}

interface Session {
  token: string;
  call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
}

/** Logs in over ABS's HTTP API (the way e2e/seed-progress.sh does) and returns a caller for authenticated requests. */
export async function absSession(env: E2EEnv): Promise<Session> {
  const login = await fetch(`${env.absUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.username, password: env.password }),
  });
  if (!login.ok) throw new Error(`ABS login as the e2e user failed: HTTP ${login.status}`);
  const token = ((await login.json()) as { user: { accessToken: string } }).user.accessToken;
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${env.absUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ABS ${method} ${path}: HTTP ${res.status}`);
    const text = await res.text();
    // Some writes answer a bare "OK".
    try {
      return (text ? JSON.parse(text) : undefined) as T;
    } catch {
      return undefined as T;
    }
  };
  return { token, call };
}

const toBook = (i: Item): Book => ({
  id: i.id,
  title: i.media.metadata.title,
  duration: i.media.duration ?? 0,
  chapters: i.media.numChapters ?? 0,
  narrator: i.media.metadata.narratorName ?? '',
});

/** Where in the hero the user is left: inside the first chapter, so a few skips never cross a boundary. */
const HERO_AT = 120;

/**
 * Puts the e2e user in a known state, whatever a previous run left: every listening record removed, then two books
 * part-way through (the second the most recent, so it is the hero) and the rest untouched. Books are chosen by their
 * properties, not their titles: the library may be the LibriVox set or the stand-ins.
 */
export async function resetUser(env: E2EEnv): Promise<Seed> {
  const { call } = await absSession(env);

  const me = await call<{ mediaProgress?: { id: string }[] }>('GET', '/api/me');
  for (const p of me.mediaProgress ?? []) await call('DELETE', `/api/me/progress/${p.id}`);

  const { libraries } = await call<{ libraries: { id: string; mediaType: string }[] }>('GET', '/api/libraries');
  const library = libraries.find((l) => l.mediaType === 'book');
  if (!library) throw new Error('The e2e ABS has no book library: run ./e2e/up.sh');
  const { results } = await call<{ results: Item[] }>(
    'GET',
    `/api/libraries/${library.id}/items?sort=media.metadata.title&minified=1`
  );
  const books = results.map(toBook);

  // Long enough to skip around in and with chapters to move between; two of them, plus at least two more left over so
  // "Recently added" has something and a book with a narrator to search for.
  const playable = books.filter((b) => b.chapters >= 2 && b.duration >= 1800);
  if (playable.length < 2 || books.length < 4) {
    throw new Error(
      'The e2e library needs at least 4 books, 2 of them with chapters and over 30 minutes: run ./e2e/up.sh'
    );
  }
  const [other, hero] = playable;

  const at = async (b: Book, currentTime: number) => {
    await call('PATCH', `/api/me/progress/${b.id}`, {
      duration: b.duration,
      currentTime,
      progress: currentTime / b.duration,
      isFinished: false,
    });
    // lastUpdate is a millisecond timestamp; keep the order of the two writes unambiguous.
    await new Promise((r) => setTimeout(r, 50));
  };
  await at(other, other.duration * 0.25);
  await at(hero, HERO_AT);

  const narrated = books.find((b) => b.narrator);
  if (!narrated) throw new Error('No book in the e2e library has a narrator');
  return { hero, other, heroAt: HERO_AT, unstarted: books.filter((b) => b !== hero && b !== other), narrated };
}

/** Whether the user has any listening record for the book (ABS makes one as soon as a session opens). */
export async function hasProgress(env: E2EEnv, itemId: string): Promise<boolean> {
  const { call } = await absSession(env);
  return call('GET', `/api/me/progress/${itemId}`).then(
    () => true,
    () => false
  );
}

/** The server's saved place in a book, in seconds. */
export async function savedPosition(env: E2EEnv, itemId: string): Promise<number> {
  const { call } = await absSession(env);
  const p = await call<{ currentTime?: number } | undefined>('GET', `/api/me/progress/${itemId}`).catch(
    () => undefined
  );
  return p?.currentTime ?? 0;
}
