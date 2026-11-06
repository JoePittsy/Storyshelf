// The order of things when a book's progress is changed by hand: the player lets go of the book before the server is
// touched, the Undo snapshot is read after that, and Undo puts the book back in an empty player.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressSnapshot } from './bookProgress';
import type { Released } from './engine';

const order: string[] = [];
const held: Released = {
  restorable: { id: 'li_1', title: 'The Book', author: 'An Author', duration: 1000, position: 250, updatedAt: 0 },
  chapters: [{ id: 0, start: 0, end: 1000, title: 'One' }],
};
const prev: ProgressSnapshot = {
  id: 'mp_1',
  currentTime: 250,
  duration: 1000,
  progress: 0.25,
  isFinished: false,
  finishedAt: null,
  startedAt: 10,
  lastUpdate: 20,
  hideFromContinueListening: false,
  ebookLocation: null,
  ebookProgress: null,
};
let inPlayer: Released | null;
let progress: ProgressSnapshot | null;

vi.mock('./engine', () => ({
  release: vi.fn(async (id: string) => {
    order.push(`release ${id}`);
    const out = inPlayer;
    inPlayer = null;
    return out;
  }),
  restore: vi.fn((r: { id: string; position: number }) => order.push(`restore ${r.id} at ${r.position}`)),
}));
vi.mock('./bookProgress', () => ({
  getProgress: vi.fn(async () => {
    order.push('get');
    return progress;
  }),
  setFinished: vi.fn(async (_id: string, f: boolean) => void order.push(`finished ${f}`)),
  removeProgress: vi.fn(async (id: string) => void order.push(`delete ${id}`)),
  restoreProgress: vi.fn(
    async (_id: string, p: ProgressSnapshot | null) => void order.push(`put back ${p?.currentTime ?? 'none'}`)
  ),
}));

import * as engine from './engine';
import { changeProgress, undoProgressChange } from './progressActions';

beforeEach(() => {
  order.length = 0;
  inPlayer = null;
  progress = prev;
  vi.clearAllMocks();
});

describe('changing progress by hand', () => {
  it('mark finished: the player lets go of the book, then the snapshot is read, then the server is told', async () => {
    inPlayer = held;
    const change = await changeProgress('li_1', 'finish');
    expect(order).toEqual(['release li_1', 'get', 'finished true']);
    expect(change).toEqual({ action: 'finish', itemId: 'li_1', prev, held });
  });

  it('mark not finished goes the same way', async () => {
    await changeProgress('li_1', 'unfinish');
    expect(order).toEqual(['release li_1', 'get', 'finished false']);
  });

  it('reset deletes the record the snapshot names; with no record there is nothing to delete', async () => {
    await changeProgress('li_1', 'reset');
    expect(order).toEqual(['release li_1', 'get', 'delete mp_1']);
    order.length = 0;
    progress = null;
    expect((await changeProgress('li_1', 'reset')).prev).toBeNull();
    expect(order).toEqual(['release li_1', 'get']);
  });

  it('a failure on the server is passed on, after the player has let go', async () => {
    const { setFinished } = await import('./bookProgress');
    vi.mocked(setFinished).mockRejectedValueOnce(new Error('offline'));
    await expect(changeProgress('li_1', 'finish')).rejects.toThrow('offline');
    expect(order).toEqual(['release li_1', 'get']);
  });
});

describe('Undo', () => {
  it('stops the book if it has been played since, puts the progress back, then puts the book back in the player', async () => {
    const change = { action: 'finish' as const, itemId: 'li_1', prev, held };
    await undoProgressChange(change);
    expect(order).toEqual(['release li_1', 'put back 250', 'restore li_1 at 250']);
    expect(engine.restore).toHaveBeenCalledWith(
      expect.objectContaining({ position: 250, updatedAt: 20, title: 'The Book' }),
      held.chapters
    );
  });

  it("leaves the player alone when the change didn't take the book out of it", async () => {
    await undoProgressChange({ action: 'reset', itemId: 'li_1', prev, held: null });
    expect(order).toEqual(['release li_1', 'put back 250']);
    expect(engine.restore).not.toHaveBeenCalled();
  });

  it('with no progress before, the book goes back where the player had it', async () => {
    await undoProgressChange({ action: 'finish', itemId: 'li_1', prev: null, held });
    expect(order).toEqual(['release li_1', 'put back none', 'restore li_1 at 250']);
  });
});
