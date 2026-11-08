// The download manager: one book at a time, the rest queued; each file resumed from where it stopped; pause, resume,
// remove; network failures retried with growing waits. iOS suspends a page in the background, so a download only moves
// while the app is on screen: whatever stops it there carries on by itself when the app is back and online.
import {
  COVER_FILE,
  ChangedError,
  HttpError,
  RETRY_DELAYS,
  ShortReadError,
  WHY,
  classify,
  fmtBytes,
  newRecord,
  readReply,
  resumePlan,
  spaceCheck,
  trackFile,
  type ExpandedItem,
} from './plan';
import type { FileStore, FileWriter, MetaStore } from './storage';
import type { DownloadRecord, DownloadedBook, DownloadedItem } from './types';

/** The network: the expanded item, a file (with an optional Range), the cover. */
export interface Net {
  item(itemId: string): Promise<ExpandedItem>;
  file(itemId: string, ino: string, range: string | null, signal: AbortSignal): Promise<Response>;
  cover(itemId: string, signal: AbortSignal): Promise<Blob | null>;
}

/** The browser around the manager; tests pass a fake. */
export interface Env {
  online(): boolean;
  /** Calls back when the app comes online. Returns the unsubscribe. */
  onOnline(cb: () => void): () => void;
  visible(): boolean;
  /** Calls back when the app comes back on screen. Returns the unsubscribe. */
  onVisible(cb: () => void): () => void;
  estimate(): Promise<{ quota?: number; usage?: number } | null>;
  persist(): Promise<boolean>;
  /** Who is signed in, if anyone, for the permission check and the record. */
  user(): { id?: string; permissions?: Record<string, boolean> } | null;
  server(): string;
  objectUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  /** Keeps the screen on while true. */
  keepAwake(on: boolean): void;
  now(): number;
  /** Resolves after `ms`, or rejects with an AbortError when `signal` aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export interface Deps {
  meta: MetaStore;
  files: FileStore;
  net: Net;
  env: Env;
  /** Receives every new list of downloads (newest first). */
  publish(books: DownloadedBook[]): void;
  /** No bytes for this long while on screen: the connection is treated as dropped and the file resumed. */
  stallMs?: number;
}

export type StartResult = { ok: true } | { ok: false; reason: string };

/** How often progress reaches the screen, and IndexedDB. */
const PUBLISH_EVERY = 250;
const SAVE_EVERY = 2000;

type Outcome =
  { kind: 'complete' } | { kind: 'stopped' } | { kind: 'paused'; why: string } | { kind: 'failed'; why: string };

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';

export class DownloadManager {
  private records = new Map<string, DownloadRecord>();
  private covers = new Map<string, string>();
  private trackUrls = new Map<string, string[]>();
  private running: { itemId: string; ctrl: AbortController; done: Promise<void> } | null = null;
  private persistAsked = false;
  private lastPublish = 0;
  private lastSave = 0;
  private unsubscribe: (() => void)[] = [];
  readonly ready: Promise<void>;

  constructor(private deps: Deps) {
    this.ready = this.load();
  }

  /** Loads what's on the device. A book left downloading (the app was closed) is paused, to carry on by itself. */
  private async load(): Promise<void> {
    const { meta, env } = this.deps;
    let all: DownloadRecord[] = [];
    try {
      all = await meta.all();
    } catch {
      // IndexedDB unavailable: nothing to show, and starting a download will say so.
    }
    for (const r of all) {
      if (r.status === 'downloading') {
        r.status = 'paused';
        r.error = WHY.closed;
        r.autoResume = true;
        await meta.put(r).catch(() => undefined);
      }
      this.records.set(r.itemId, r);
      if (r.hasCover) await this.loadCover(r.itemId);
    }
    this.publish(true);
    this.unsubscribe.push(
      env.onOnline(() => this.kick()),
      env.onVisible(() => this.kick())
    );
    this.kick();
  }

  private async loadCover(itemId: string): Promise<void> {
    try {
      const f = await this.deps.files.file(itemId, COVER_FILE);
      if (f) this.covers.set(itemId, this.deps.env.objectUrl(new Blob([f], { type: 'image/jpeg' })));
    } catch {
      // No cover: the book shows its placeholder.
    }
  }

  /** Stops listening (tests). */
  dispose(): void {
    this.unsubscribe.forEach((u) => u());
    this.running?.ctrl.abort();
  }

  // --- what the app reads ---------------------------------------------------------------------

  books(): DownloadedBook[] {
    return [...this.records.values()]
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((r) => ({
        itemId: r.itemId,
        libraryId: r.libraryId,
        title: r.title,
        author: r.author,
        coverUrl: this.covers.get(r.itemId) ?? null,
        duration: r.duration,
        bytes: r.bytes,
        totalBytes: r.totalBytes,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
        addedAt: r.addedAt,
      }));
  }

  private publish(force = false): void {
    const now = this.deps.env.now();
    if (!force && now - this.lastPublish < PUBLISH_EVERY) return;
    this.lastPublish = now;
    this.deps.publish(this.books());
  }

  private async save(r: DownloadRecord): Promise<void> {
    this.lastSave = this.deps.env.now();
    // A book removed meanwhile stays removed.
    if (this.records.get(r.itemId) !== r) return;
    await this.deps.meta.put({ ...r }).catch(() => undefined);
  }

  async item(itemId: string): Promise<DownloadedItem | null> {
    await this.ready;
    const r = this.records.get(itemId);
    if (!r) return null;
    const { libraryId, title, author, duration, chapters, tracks, updatedAt } = r;
    return { itemId, libraryId, title, author, duration, chapters, tracks, updatedAt };
  }

  /** Object URLs of every file in play order, typed to play, once the whole book is on the device; else null. */
  async localTrackUrls(itemId: string): Promise<string[] | null> {
    await this.ready;
    const r = this.records.get(itemId);
    if (r?.status !== 'complete') return null;
    const kept = this.trackUrls.get(itemId);
    if (kept) return kept;
    const urls: string[] = [];
    for (const t of r.tracks) {
      const f = await this.deps.files.file(itemId, trackFile(t));
      if (!f || f.size !== t.size) {
        urls.forEach((u) => this.deps.env.revokeUrl(u));
        return null;
      }
      urls.push(this.deps.env.objectUrl(new Blob([f], { type: t.mimeType })));
    }
    this.trackUrls.set(itemId, urls);
    return urls;
  }

  // --- what the listener does -----------------------------------------------------------------

  /** Downloads a book: checks the permission, the connection and the space, then queues it. */
  async start(itemId: string): Promise<StartResult> {
    await this.ready;
    const { env, net, meta } = this.deps;
    const existing = this.records.get(itemId);
    if (existing) {
      if (existing.status === 'paused' || existing.status === 'failed') this.resume(itemId);
      return { ok: true };
    }
    if (!env.online()) return { ok: false, reason: "You're offline. Connect to download this book." };
    const user = env.user();
    if (!user?.permissions?.download) return { ok: false, reason: WHY.noPermission };
    let item: ExpandedItem;
    try {
      item = await net.item(itemId);
    } catch {
      return { ok: false, reason: "Couldn't get the book's details from the server. Try again." };
    }
    const record = newRecord(item, env.now(), { userId: user.id, server: env.server() });
    if (record.tracks.length === 0) return { ok: false, reason: WHY.noFiles };
    // Others in the queue will take their share too.
    const queued = [...this.records.values()]
      .filter((r) => r.status !== 'complete')
      .reduce((n, r) => n + (r.totalBytes - r.bytes), 0);
    const room = spaceCheck(record.totalBytes + queued, await env.estimate().catch(() => null));
    if (!room.ok)
      return {
        ok: false,
        reason: `Not enough space on this device: the book needs ${fmtBytes(record.totalBytes)} and ${fmtBytes(room.free)} is free.`,
      };
    if (this.records.has(itemId)) return { ok: true }; // asked twice while checking
    if (!this.persistAsked) {
      this.persistAsked = true;
      // So the browser doesn't clear the books when the device is short of space. Safari says yes to an installed app.
      void env.persist().catch(() => false);
    }
    this.records.set(itemId, record);
    try {
      await meta.put({ ...record });
    } catch {
      this.records.delete(itemId);
      return { ok: false, reason: "Couldn't save the download on this device." };
    }
    this.publish(true);
    this.kick();
    return { ok: true };
  }

  pause(itemId: string): void {
    const r = this.records.get(itemId);
    if (!r || (r.status !== 'downloading' && r.status !== 'queued')) return;
    r.status = 'paused';
    delete r.error;
    r.autoResume = false;
    if (this.running?.itemId === itemId) this.running.ctrl.abort();
    void this.save(r);
    this.publish(true);
  }

  resume(itemId: string): void {
    const r = this.records.get(itemId);
    if (!r || (r.status !== 'paused' && r.status !== 'failed')) return;
    r.status = 'queued';
    delete r.error;
    r.autoResume = false;
    void this.save(r);
    this.publish(true);
    this.kick();
  }

  /** Cancels or removes a download: its files, its record and its object URLs. */
  async remove(itemId: string): Promise<void> {
    await this.ready;
    const run = this.running;
    if (run?.itemId === itemId) {
      run.ctrl.abort();
      await run.done;
    }
    this.records.delete(itemId);
    const cover = this.covers.get(itemId);
    if (cover) this.deps.env.revokeUrl(cover);
    this.covers.delete(itemId);
    this.trackUrls.get(itemId)?.forEach((u) => this.deps.env.revokeUrl(u));
    this.trackUrls.delete(itemId);
    this.publish(true);
    await this.deps.meta.del(itemId).catch(() => undefined);
    await this.deps.files.removeBook(itemId);
  }

  // --- the queue ------------------------------------------------------------------------------

  /** Starts the next book if nothing is running and the app is on screen and online. */
  private kick(): void {
    const { env } = this.deps;
    if (this.running || !env.online() || !env.visible()) return;
    for (const r of this.records.values()) {
      if (r.status === 'paused' && r.autoResume) {
        r.status = 'queued';
        delete r.error;
        r.autoResume = false;
      }
    }
    const next = [...this.records.values()]
      .filter((r) => r.status === 'queued')
      .sort((a, b) => a.addedAt - b.addedAt)[0];
    if (!next) {
      this.publish(true);
      return;
    }
    this.run(next);
  }

  private run(r: DownloadRecord): void {
    const { env, files } = this.deps;
    const ctrl = new AbortController();
    r.status = 'downloading';
    delete r.error;
    r.autoResume = false;
    void this.save(r);
    this.publish(true);
    env.keepAwake(true);
    const done = this.attempts(r, ctrl.signal).then((o) => this.settle(r, o));
    this.running = { itemId: r.itemId, ctrl, done };
    void done.finally(() => {
      this.running = null;
      env.keepAwake(false);
      files.idle();
      this.kick();
    });
  }

  private async settle(r: DownloadRecord, o: Outcome): Promise<void> {
    if (this.records.get(r.itemId) !== r) return; // removed
    if (o.kind === 'complete') {
      r.status = 'complete';
      r.bytes = r.totalBytes;
      r.completedAt = this.deps.env.now();
      delete r.error;
    } else if (o.kind === 'paused') {
      r.status = 'paused';
      r.error = o.why;
      r.autoResume = true;
    } else if (o.kind === 'failed') {
      r.status = 'failed';
      r.error = o.why;
    }
    // 'stopped': pause() has already said where it stands.
    await this.save(r);
    this.publish(true);
  }

  /** Tries until the book is whole, the listener stops it, or a failure isn't worth another try. */
  private async attempts(r: DownloadRecord, signal: AbortSignal): Promise<Outcome> {
    const { env } = this.deps;
    let tries = 0;
    for (;;) {
      const before = r.bytes;
      try {
        await this.fetchBook(r, signal);
        return { kind: 'complete' };
      } catch (e) {
        if (signal.aborted) return { kind: 'stopped' };
        const f = classify(e);
        if (f.kind === 'fatal') return { kind: 'failed', why: f.why };
        if (!env.online()) return { kind: 'paused', why: WHY.offline };
        if (!env.visible()) return { kind: 'paused', why: WHY.background };
        // Progress since the last failure: the connection works, so the waits start short again.
        if (r.bytes > before) tries = 0;
        if (tries >= RETRY_DELAYS.length) return { kind: 'failed', why: WHY.unreachable };
        try {
          await env.sleep(RETRY_DELAYS[tries++] ?? 60_000, signal);
        } catch {
          return { kind: 'stopped' };
        }
      }
    }
  }

  /** One pass over the book: the cover once, then each file that isn't whole yet, in play order. */
  private async fetchBook(r: DownloadRecord, signal: AbortSignal): Promise<void> {
    const { files } = this.deps;
    if (!r.hasCover) await this.fetchCover(r, signal);
    let done = 0;
    for (const t of r.tracks) {
      signal.throwIfAborted();
      const name = trackFile(t);
      let have = await files.size(r.itemId, name);
      // Longer than the server says: not this file. Start it again.
      if (t.size > 0 && have > t.size) have = 0;
      const plan = resumePlan(have, t.size || null);
      if (plan.complete) {
        done += t.size;
        continue;
      }
      await this.fetchFile(r, t, name, plan, done, signal);
      done += t.size;
    }
  }

  private async fetchCover(r: DownloadRecord, signal: AbortSignal): Promise<void> {
    const { net, files } = this.deps;
    let blob: Blob | null;
    try {
      blob = await net.cover(r.itemId, signal);
    } catch (e) {
      if (signal.aborted) throw e;
      return; // a book without a cover still downloads; the cover is tried again on the next pass
    }
    if (!blob) {
      r.hasCover = true; // none on the server: don't ask again
      return;
    }
    const w = await files.open(r.itemId, COVER_FILE, true);
    try {
      await w.write(new Uint8Array(await blob.arrayBuffer()));
    } finally {
      await w.close();
    }
    r.hasCover = true;
    if (!this.covers.has(r.itemId))
      this.covers.set(r.itemId, this.deps.env.objectUrl(new Blob([blob], { type: 'image/jpeg' })));
    void this.save(r);
    this.publish(true);
  }

  private async fetchFile(
    r: DownloadRecord,
    t: DownloadRecord['tracks'][number],
    name: string,
    plan: ReturnType<typeof resumePlan>,
    doneBefore: number,
    signal: AbortSignal
  ): Promise<void> {
    const { net, files } = this.deps;
    // A watchdog over the outer signal: a connection that stops sending is dropped and resumed.
    const ctrl = new AbortController();
    const stop = () => ctrl.abort(signal.reason);
    signal.addEventListener('abort', stop);
    if (signal.aborted) stop();
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stallMs = this.deps.stallMs ?? 30_000;
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!this.deps.env.visible()) return watch(); // suspended, not stalled: judged when it's back
        stalled = true;
        ctrl.abort();
      }, stallMs);
    };
    let writer: FileWriter | null = null;
    try {
      watch();
      const res = await net.file(r.itemId, t.ino, plan.range, ctrl.signal);
      const action = readReply(res.status, plan);
      if (action.kind === 'fail') {
        await res.body?.cancel().catch(() => undefined);
        throw new HttpError(res.status);
      }
      if (action.kind === 'complete') {
        // 416: nothing past what's here, yet it's short of the size ABS gave. Start this file again next pass.
        await res.body?.cancel().catch(() => undefined);
        await (await files.open(r.itemId, name, true)).close();
        throw new ShortReadError('The server had nothing more to send');
      }
      if (!res.body) throw new ShortReadError('The reply has no body');
      const offset = action.kind === 'append' ? action.offset : 0;
      writer = await files.open(r.itemId, name, offset === 0);
      if (writer.opened !== offset) throw new ShortReadError('The file changed while it was closed');
      let at = offset;
      r.bytes = doneBefore + at;
      this.publish(true);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        watch();
        const n = value.byteLength; // the write transfers the buffer, leaving `value` empty
        await writer.write(value);
        at += n;
        r.bytes = doneBefore + at;
        this.publish();
        if (this.deps.env.now() - this.lastSave >= SAVE_EVERY) void this.save(r);
      }
      const w = writer;
      writer = null;
      const size = await w.close();
      if (t.size > 0 && size > t.size) {
        // More than ABS said the file holds: it changed on the server since the book was queued.
        throw new ChangedError();
      }
      if (t.size > 0 && size < t.size) throw new ShortReadError();
    } catch (e) {
      if (stalled && !signal.aborted) throw new ShortReadError('No data for a while');
      if (isAbort(e) && !signal.aborted) throw new ShortReadError('Interrupted');
      throw e;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      // Keep what arrived, so the next try resumes from it.
      if (writer) await writer.close().catch(() => undefined);
    }
  }
}
