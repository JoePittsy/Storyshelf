/**
 * Tests for the diagnostics ring buffer.
 * Code under test: apps/web/src/player/diag.ts
 *
 * Design facts: capped, oldest dropped first; persisted with throttled writes; storage failures never throw.
 */
import { describe, expect, it, vi } from 'vitest';
import { DIAG_KEY, createDiag, formatDiag } from './diag';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const saved = (m: ReturnType<typeof memory>): unknown[] => JSON.parse(m.data.get(DIAG_KEY) ?? '[]') as unknown[];

describe('createDiag', () => {
  it('keeps entries in order with the time, event and detail', () => {
    const m = memory();
    const d = createDiag({ storage: () => m, iso: () => 'T' });
    d.log('a');
    d.log('b', { n: 1 });
    expect(d.entries()).toEqual([
      { t: 'T', ev: 'a' },
      { t: 'T', ev: 'b', detail: { n: 1 } },
    ]);
  });

  it('drops the oldest beyond the cap', () => {
    const m = memory();
    const d = createDiag({ storage: () => m, max: 3 });
    for (const ev of ['1', '2', '3', '4', '5']) d.log(ev);
    expect(d.entries().map((e) => e.ev)).toEqual(['3', '4', '5']);
  });

  it('writes the first entry at once and throttles the rest until flushed', () => {
    const m = memory();
    let t = 0;
    const d = createDiag({ storage: () => m, now: () => t });
    d.log('a');
    expect(saved(m)).toHaveLength(1);
    t = 100;
    d.log('b');
    d.log('c');
    expect(saved(m)).toHaveLength(1);
    d.flush();
    expect(saved(m)).toHaveLength(3);
  });

  it('restores what an earlier page saved, capped, ignoring junk', () => {
    const m = memory();
    m.setItem(DIAG_KEY, JSON.stringify([{ t: 'x', ev: '1' }, 5, { t: 'x', ev: '2' }, { t: 'x', ev: '3' }]));
    const d = createDiag({ storage: () => m, max: 2 });
    expect(d.entries().map((e) => e.ev)).toEqual(['2', '3']);
  });

  it('starts empty and keeps logging when storage throws', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    const d = createDiag({ storage: () => ({ getItem: boom, setItem: boom, removeItem: boom }) });
    expect(d.entries()).toEqual([]);
    expect(() => d.log('a')).not.toThrow();
    expect(() => d.flush()).not.toThrow();
    expect(() => d.clear()).not.toThrow();
    d.log('b');
    expect(d.entries().map((e) => e.ev)).toEqual(['b']);
  });

  it('starts empty from corrupt JSON', () => {
    const m = memory();
    m.setItem(DIAG_KEY, '{nope');
    expect(createDiag({ storage: () => m }).entries()).toEqual([]);
  });

  it('clear empties the list and the storage, and notifies', () => {
    const m = memory();
    const d = createDiag({ storage: () => m });
    const cb = vi.fn();
    d.subscribe(cb);
    d.log('a');
    d.clear();
    expect(d.entries()).toEqual([]);
    expect(m.data.has(DIAG_KEY)).toBe(false);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe('formatDiag', () => {
  it('prints newest first, one line each', () => {
    expect(
      formatDiag([
        { t: 'T1', ev: 'a' },
        { t: 'T2', ev: 'b', detail: { x: 1 } },
      ])
    ).toBe('T2 b {"x":1}\nT1 a');
  });
});
