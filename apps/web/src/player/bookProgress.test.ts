/**
 * Marking a book finished or not, resetting it, and Undo putting the exact previous state back.
 *
 * absFetch is replaced by a small fake of ABS 2.37.2's progress routes that follows its server code
 * (MediaProgress.applyProgressUpdate and User.createUpdateMediaProgressFromPayload), including the awkward parts that
 * were confirmed against the running server: un-finishing zeroes the place and ignores a place sent with it; moving a
 * finished book's place un-finishes it; a place in the last 10 seconds finishes it; DELETE takes the record's id;
 * `createdAt` is honoured only on create; `lastUpdate` overwrites the record's update time; a `progress` that matches the
 * place (currentTime / duration) is ignored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/auth', async (orig) => ({ ...(await orig<typeof import('../api/auth')>()), absFetch: vi.fn() }));

import * as auth from '../api/auth';
import { getProgress, removeProgress, restoreProgress, setFinished, type ProgressSnapshot } from './bookProgress';

const absFetch = vi.mocked(auth.absFetch);
const ITEM = 'li_1';
const DURATION = 1000;

interface Row {
  id: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
  finishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  hideFromContinueListening: boolean;
}

let row: Row | null;
let clock: number;
let ids: number;
let calls: { method: string; url: string; body?: Record<string, unknown> }[];

const tick = () => (clock += 1000);

const placeProgress = (r: Row) => (r.duration ? Math.max(0, Math.min(r.currentTime / r.duration, 1)) : 0);

/** applyProgressUpdate, as ABS 2.37.2 has it (books only). */
function apply(r: Row, p: Record<string, unknown>): void {
  const before = r.currentTime;
  if (p.isFinished !== undefined) {
    if (p.isFinished && !r.isFinished) {
      r.finishedAt = (p.finishedAt as number) || clock;
      r.progress = 1;
      delete p.finishedAt;
    } else if (!p.isFinished && r.isFinished) {
      r.finishedAt = null;
      r.progress = 0;
      r.currentTime = 0;
      delete p.finishedAt;
      delete p.currentTime;
    }
  } else if (typeof p.progress === 'number' && p.progress !== placeProgress(r)) {
    // ABS compares with the place's share of the book (its `progress` getter), not the stored progress, so a PATCH of
    // `progress` alone, matching the current place, changes nothing.
    r.progress = Math.min(1, Math.max(0, p.progress));
  }
  for (const k of ['currentTime', 'duration', 'isFinished', 'finishedAt', 'hideFromContinueListening'] as const)
    if (k in p) (r as unknown as Record<string, unknown>)[k] = p[k];
  const moved = r.currentTime !== before;
  if (moved && !p.hideFromContinueListening) r.hideFromContinueListening = false;
  const remainingLimit = typeof p.markAsFinishedTimeRemaining === 'number' ? p.markAsFinishedTimeRemaining : 10;
  const shouldFinish = r.duration > 0 && r.duration - r.currentTime < remainingLimit;
  if (!r.isFinished && shouldFinish) {
    r.isFinished = true;
    r.finishedAt ??= clock;
    r.progress = 1;
  } else if (r.isFinished && moved && !shouldFinish) {
    r.isFinished = false;
    r.finishedAt = null;
  }
  r.updatedAt = clock;
  if (typeof p.lastUpdate === 'number') r.updatedAt = p.lastUpdate;
}

function create(p: Record<string, unknown>): Row {
  const r: Row = {
    id: `mp_${++ids}`,
    duration: (p.duration as number) ?? 0,
    currentTime: (p.currentTime as number) ?? 0,
    isFinished: !!p.isFinished,
    hideFromContinueListening: !!p.hideFromContinueListening,
    finishedAt: (p.finishedAt as number) || null,
    createdAt: (p.createdAt as number) || clock,
    updatedAt: clock,
    progress: (p.progress as number) ?? 0,
  };
  if (r.isFinished) {
    r.finishedAt ||= clock;
    r.progress = 1;
  } else r.finishedAt = null;
  return r;
}

const json = (r: Row) => ({
  id: r.id,
  libraryItemId: ITEM,
  duration: r.duration,
  progress: r.progress,
  currentTime: r.currentTime,
  isFinished: r.isFinished,
  hideFromContinueListening: r.hideFromContinueListening,
  lastUpdate: r.updatedAt,
  startedAt: r.createdAt,
  finishedAt: r.finishedAt,
});

beforeEach(() => {
  row = null;
  clock = 1_000_000;
  ids = 0;
  calls = [];
  absFetch.mockReset();
  absFetch.mockImplementation((url: string, init: RequestInit = {}) => {
    tick();
    const method = init.method ?? 'GET';
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
    calls.push({ method, url, body });
    const notFound = () => Promise.reject(new auth.AbsError(404, 'Not Found'));
    if (url === `/api/me/progress/${ITEM}` && method === 'GET') return row ? Promise.resolve(json(row)) : notFound();
    if (url === `/api/me/progress/${ITEM}` && method === 'PATCH') {
      if (row) apply(row, { ...body });
      else row = create({ ...body });
      return Promise.resolve(undefined);
    }
    if (method === 'DELETE') {
      if (!row || url !== `/api/me/progress/${row.id}`) return notFound();
      row = null;
      return Promise.resolve(undefined);
    }
    return Promise.reject(new Error(`unexpected ${method} ${url}`));
  });
});

/** Listen to `seconds` of the book: what a playback sync leaves behind. */
function listenTo(seconds: number, hidden = false) {
  tick();
  row ??= create({ duration: DURATION });
  apply(row, {
    currentTime: seconds,
    duration: DURATION,
    progress: seconds / DURATION,
    hideFromContinueListening: hidden,
  });
}

const state = () => (row ? { ...json(row), id: undefined } : null);
const without = (s: ProgressSnapshot | null) => s && { ...s, id: undefined };

describe('reading progress', () => {
  it('is null when the book has none, and the whole record when it has', async () => {
    expect(await getProgress(ITEM)).toBeNull();
    listenTo(300);
    expect(await getProgress(ITEM)).toMatchObject({
      id: 'mp_1',
      currentTime: 300,
      progress: 0.3,
      isFinished: false,
      finishedAt: null,
    });
  });

  it('passes on anything other than a 404', async () => {
    absFetch.mockRejectedValueOnce(new auth.AbsError(500, 'boom'));
    await expect(getProgress(ITEM)).rejects.toMatchObject({ status: 500 });
  });
});

describe('marking finished and not finished', () => {
  it('PATCHes the library item with isFinished alone', async () => {
    listenTo(300);
    await setFinished(ITEM, true);
    expect(calls[calls.length - 1]).toEqual({
      method: 'PATCH',
      url: `/api/me/progress/${ITEM}`,
      body: { isFinished: true },
    });
    expect(state()).toMatchObject({ isFinished: true, currentTime: 300, progress: 1 });
    await setFinished(ITEM, false);
    expect(state()).toMatchObject({ isFinished: false, currentTime: 0, progress: 0, finishedAt: null });
  });
});

describe('resetting', () => {
  it('DELETEs by the progress record id, not the library item id', async () => {
    listenTo(300);
    const p = await getProgress(ITEM);
    await removeProgress(p!.id);
    expect(calls[calls.length - 1]).toMatchObject({ method: 'DELETE', url: '/api/me/progress/mp_1' });
    expect(row).toBeNull();
  });
});

describe('Undo restores the exact previous state', () => {
  const cases: [string, () => void, () => Promise<void>][] = [
    ['mark finished, part way through', () => listenTo(300), () => setFinished(ITEM, true)],
    ['mark finished, hidden from Continue listening', () => listenTo(300, true), () => setFinished(ITEM, true)],
    ['mark finished, never started', () => undefined, () => setFinished(ITEM, true)],
    ['mark finished, 5 s from the end', () => listenTo(994.5), () => setFinished(ITEM, true)],
    [
      'mark not finished, finished part way through',
      () => {
        listenTo(300);
        tick();
        apply(row!, { isFinished: true });
      },
      () => setFinished(ITEM, false),
    ],
    ['mark not finished, finished at the end', () => listenTo(999), () => setFinished(ITEM, false)],
    ['reset, part way through', () => listenTo(300), async () => removeProgress((await getProgress(ITEM))!.id)],
    [
      'reset, finished',
      () => {
        listenTo(300);
        tick();
        apply(row!, { isFinished: true });
      },
      async () => removeProgress((await getProgress(ITEM))!.id),
    ],
  ];

  it.each(cases)('%s', async (_name, arrange, act) => {
    arrange();
    tick();
    const before = await getProgress(ITEM);
    const expected = state();
    await act();
    expect(state()).not.toEqual(expected);
    tick();
    await restoreProgress(ITEM, before);
    expect(state()).toEqual(expected);
    expect(without(await getProgress(ITEM))).toEqual(without(before));
  });

  it('a reset and its Undo leave a record with a new id (the one thing it cannot keep)', async () => {
    listenTo(300);
    const before = await getProgress(ITEM);
    await removeProgress(before!.id);
    await restoreProgress(ITEM, before);
    expect((await getProgress(ITEM))!.id).not.toBe(before!.id);
  });

  it('is undone over whatever has happened since (a play from the start after finishing)', async () => {
    listenTo(300);
    const before = await getProgress(ITEM);
    const expected = state();
    await setFinished(ITEM, true);
    tick();
    apply(row!, { currentTime: 20, duration: DURATION, progress: 0.02 }); // played again from 0, un-finishing it
    await restoreProgress(ITEM, before);
    expect(state()).toEqual(expected);
  });
});
