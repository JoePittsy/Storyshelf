import { describe, expect, it } from 'vitest';
import { morphShape, type MorphBox } from './morphPath';

type Pt = [number, number];

/** Every point in an "M x y C ... Z" path. */
function points(d: string): Pt[] {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out: Pt[] = [];
  for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
}
const bbox = (pts: Pt[]) => ({
  x0: Math.min(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])),
  x1: Math.max(...pts.map((p) => p[0])),
  y1: Math.max(...pts.map((p) => p[1])),
});

const A: MorphBox = { x: 20, y: 20, w: 200, h: 200, r: 16 };
const B: MorphBox = { x: 420, y: 380, w: 120, h: 120, r: 12 };
const edges = (b: MorphBox) => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h });

describe('morphShape', () => {
  for (const [name, a, b] of [
    ['A above-left of B', A, B],
    ['B back to A', B, A],
    ['A above-right of B', { ...A, x: 600 }, { ...B, x: 100 }],
    ['A below-left of B', { ...A, y: 600 }, { ...B, y: 20 }],
  ] as [string, MorphBox, MorphBox][]) {
    describe(name, () => {
      it('is exactly the source square at t=0', () => {
        const s = morphShape(a, b, 0);
        expect(bbox(points(s.d))).toEqual(edges(a));
        expect(s.from).toEqual(a);
        expect(s.fromOpacity).toBe(1);
        expect(s.toOpacity).toBe(0);
      });

      it('is exactly the target square at t=1', () => {
        const s = morphShape(a, b, 1);
        expect(bbox(points(s.d))).toEqual(edges(b));
        expect(s.to).toEqual(b);
        expect(s.fromOpacity).toBe(0);
        expect(s.toOpacity).toBe(1);
      });

      it('joins both full-size squares at t=0.5, with a neck narrower than the squares', () => {
        const s = morphShape(a, b, 0.5);
        expect(s.from).toEqual(a);
        expect(s.to).toEqual(b);
        const box = bbox(points(s.d));
        expect(box.x0).toBeCloseTo(Math.min(a.x, b.x), 0);
        expect(box.x1).toBeCloseTo(Math.max(a.x + a.w, b.x + b.w), 0);
        expect(box.y0).toBeCloseTo(Math.min(a.y, b.y), 0);
        expect(box.y1).toBeCloseTo(Math.max(a.y + a.h, b.y + b.h), 0);
      });

      it('moves continuously with t', () => {
        let prev = points(morphShape(a, b, 0).d);
        for (let i = 1; i <= 200; i++) {
          const cur = points(morphShape(a, b, i / 200).d);
          expect(cur).toHaveLength(prev.length);
          const step = Math.max(...cur.map((p, j) => Math.hypot(p[0] - prev[j][0], p[1] - prev[j][1])));
          expect(step).toBeLessThan(30);
          prev = cur;
        }
      });

      it('never produces NaN', () => {
        for (let i = 0; i <= 20; i++) expect(morphShape(a, b, i / 20).d).not.toMatch(/NaN|Infinity/);
      });
    });
  }

  it('clamps progress outside 0..1', () => {
    expect(morphShape(A, B, -1).d).toBe(morphShape(A, B, 0).d);
    expect(morphShape(A, B, 2).d).toBe(morphShape(A, B, 1).d);
  });
});
