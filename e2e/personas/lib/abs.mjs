// A small Audiobookshelf client for the scripts: to choose books by their properties, to set up a starting place when a
// task needs one, and to check what the server holds (the app's own sync is what is under test, so checks that matter
// read the server rather than trust the screen). Same approach as apps/web/e2e/abs.ts, for a persona's own account.
import { absUrl, accountFor, passwordFor } from './env.mjs';

/** Logs in as the persona's account over ABS's HTTP API. */
export async function absSession(persona, account = accountFor(persona)) {
  const base = absUrl();
  const login = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: account, password: passwordFor(account) }),
  });
  if (!login.ok) throw new Error(`ABS login as "${account}" failed: HTTP ${login.status}`);
  const token = (await login.json()).user.accessToken;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ABS ${method} ${path}: HTTP ${res.status}`);
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : undefined;
    } catch {
      return undefined; // some writes answer a bare "OK"
    }
  };
  return { account, call, ...helpers(call) };
}

const toBook = (i) => ({
  id: i.id,
  title: i.media.metadata.title,
  duration: i.media.duration ?? 0,
  chapters: i.media.numChapters ?? 0,
  narrator: i.media.metadata.narratorName ?? '',
  author: i.media.metadata.authorName ?? '',
  series: i.media.metadata.seriesName ?? '',
});

function helpers(call) {
  return {
    /** Every book in the first book library, with the account's progress merged in (`progress` is undefined if never started). */
    async books() {
      const { libraries } = await call('GET', '/api/libraries');
      const library = libraries.find((l) => l.mediaType === 'book');
      if (!library) throw new Error('The ABS server has no book library: run ./e2e/up.sh');
      const { results } = await call('GET', `/api/libraries/${library.id}/items?sort=media.metadata.title&minified=1`);
      const me = await call('GET', '/api/me');
      const progress = new Map((me.mediaProgress ?? []).map((p) => [p.libraryItemId, p]));
      return results.map((i) => ({ ...toBook(i), progress: progress.get(i.id) }));
    },
    /** The account's saved place in a book, in seconds (0 when there is no record). */
    async savedPosition(id) {
      const p = await call('GET', `/api/me/progress/${id}`).catch(() => undefined);
      return p?.currentTime ?? 0;
    },
    /** A book's chapters from the server: [{ start, end, title }] in seconds. */
    async chapters(id) {
      const item = await call('GET', `/api/items/${id}`);
      return (item.media.chapters ?? []).map((c) => ({ start: c.start, end: c.end, title: c.title }));
    },
    /** The full progress record (currentTime, isFinished, lastUpdate…) or undefined. */
    progressOf: (id) => call('GET', `/api/me/progress/${id}`).catch(() => undefined),
    /** Puts the account at `seconds` into a book, as another device would. */
    async setPlace(book, seconds, { finished = false } = {}) {
      await call('PATCH', `/api/me/progress/${book.id}`, {
        duration: book.duration,
        currentTime: seconds,
        progress: seconds / book.duration,
        isFinished: finished,
      });
    },
    /** The account's bookmarks on one book: [{ time, title }]. */
    async bookmarks(id) {
      const me = await call('GET', '/api/me');
      return (me.bookmarks ?? []).filter((b) => b.libraryItemId === id).map((b) => ({ time: b.time, title: b.title }));
    },
    async clearBookmarks(id) {
      for (const b of await this.bookmarks(id)) await call('DELETE', `/api/me/item/${id}/bookmark/${b.time}`).catch(() => undefined);
    },
  };
}

/** A book with chapters and long enough to listen to for a while: what most tasks resume. Chosen by property, never title. */
export const playable = (b) => b.chapters >= 2 && b.duration >= 1800;
export const inProgress = (b) => !!b.progress && !b.progress.isFinished && b.progress.currentTime > 0;
export const unstarted = (b) => !b.progress || (!b.progress.isFinished && !(b.progress.currentTime > 0));
/** The most recently played book (the Library's resume hero). */
export const mostRecent = (books) =>
  books.filter((b) => b.progress).sort((a, b) => (b.progress.lastUpdate ?? 0) - (a.progress.lastUpdate ?? 0))[0];
