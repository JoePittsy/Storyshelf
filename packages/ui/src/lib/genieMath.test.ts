import { describe, expect, it } from 'vitest';
import {
  ACROSS,
  ALONG,
  NECK,
  VERTEX_COUNT,
  VERTEX_FLOATS,
  buildMesh,
  createSpine,
  genieWidth,
  genieWindow,
  meshIndices,
  setSpine,
  spineAt,
  tFromScroll,
  type GenieBox,
} from './genieMath';

const A: GenieBox = { x: 40, y: 30, w: 240, h: 240, r: 16 };
const B: GenieBox = { x: 700, y: 120, w: 144, h: 144, r: 12 };
const mesh = (a: GenieBox, b: GenieBox, t: number) => {
  const s = setSpine(createSpine(), a, b);
  const out = new Float32Array(VERTEX_COUNT * VERTEX_FLOATS);
  const meta = new Float64Array(3);
  buildMesh(s, t, out, meta);
  return { s, out, meta };
};
const vert = (out: Float32Array, row: number, col: number) => {
  const i = (row * (ACROSS + 1) + col) * VERTEX_FLOATS;
  return { x: out[i], y: out[i + 1], u: out[i + 2], v: out[i + 3] };
};
const bounds = (out: Float32Array) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < out.length; i += VERTEX_FLOATS) {
    x0 = Math.min(x0, out[i]);
    x1 = Math.max(x1, out[i]);
    y0 = Math.min(y0, out[i + 1]);
    y1 = Math.max(y1, out[i + 1]);
  }
  return { x0, y0, x1, y1 };
};

describe('spine', () => {
  it('starts at A, ends at B and leaves and arrives along the axis', () => {
    const s = setSpine(createSpine(), A, B);
    const p = new Float64Array(4);
    spineAt(s, 0, p);
    expect([p[0], p[1]]).toEqual([160, 150]);
    expect([p[2], p[3]]).toEqual([1, 0]);
    spineAt(s, s.length, p);
    expect(p[0]).toBeCloseTo(772, 6);
    expect(p[1]).toBeCloseTo(192, 6);
    expect(p[2]).toBeCloseTo(1, 6);
    expect(p[3]).toBeCloseTo(0, 6);
  });
  it('bends in an S: flat at both ends, leaning towards B between', () => {
    const s = setSpine(createSpine(), A, B);
    const p = new Float64Array(4);
    const ty: number[] = [];
    for (let q = s.startRun; q <= s.startRun + s.curve; q += s.curve / 20) {
      spineAt(s, q, p);
      ty.push(p[3]);
    }
    expect(Math.max(...ty)).toBeGreaterThan(0.05);
    expect(ty[0]).toBeCloseTo(0, 6);
    expect(ty[ty.length - 1]).toBeCloseTo(0, 1);
    for (let i = 1; i < ty.length; i++) expect(ty[i]).toBeGreaterThanOrEqual(-1e-9);
  });
  it('picks the vertical axis for a mostly vertical move, and mirrors for negative directions', () => {
    const v = setSpine(createSpine(), A, { ...B, x: 100, y: 800 });
    expect([v.ax, v.ay]).toEqual([0, 1]);
    const l = setSpine(createSpine(), B, A);
    expect([l.ax, l.ay]).toEqual([-1, 0]);
  });
  it('arc length grows monotonically along the path', () => {
    const s = setSpine(createSpine(), A, B);
    const p = new Float64Array(4);
    let prev = -Infinity;
    for (let q = -50; q < s.length + 50; q += 7) {
      spineAt(s, q, p);
      const d = p[0] * s.ax;
      expect(d).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = d;
    }
  });
});

describe('window', () => {
  const w = new Float64Array(2);
  it('is exactly A at t=0 and exactly B at t=1', () => {
    const s = setSpine(createSpine(), A, B);
    genieWindow(s, 0, w);
    expect([w[0], w[1]]).toEqual([-120, 120]);
    genieWindow(s, 1, w);
    expect(w[0]).toBeCloseTo(s.length - 72, 9);
    expect(w[1]).toBeCloseTo(s.length + 72, 9);
  });
  it('moves forwards only, leading edge first, and never inverts', () => {
    const s = setSpine(createSpine(), A, B);
    let p0 = -Infinity;
    let p1 = -Infinity;
    for (let i = 0; i <= 100; i++) {
      genieWindow(s, i / 100, w);
      expect(w[0]).toBeGreaterThanOrEqual(p0);
      expect(w[1]).toBeGreaterThanOrEqual(p1);
      expect(w[1]).toBeGreaterThan(w[0]);
      p0 = w[0];
      p1 = w[1];
    }
  });
  it('spans the whole spine mid-warp', () => {
    const s = setSpine(createSpine(), A, B);
    genieWindow(s, 0.5, w);
    expect(w[0]).toBeLessThan(s.startRun);
    expect(w[1]).toBeGreaterThan(s.length - s.b / 2);
  });
});

describe('width', () => {
  it('is A at A, B at B, and narrower than both through the neck', () => {
    const s = setSpine(createSpine(), A, B);
    expect(genieWidth(s, -100)).toBeCloseTo(240, 9);
    expect(genieWidth(s, s.startRun)).toBeCloseTo(240, 9);
    expect(genieWidth(s, s.length - 72)).toBeCloseTo(144, 9);
    expect(genieWidth(s, s.length + 100)).toBeCloseTo(144, 9);
    const mid = genieWidth(s, s.startRun + s.curve / 2);
    expect(mid).toBeLessThan(144 * (NECK + 0.15));
    expect(mid).toBeGreaterThan(144 * 0.3);
  });
});

describe('mesh', () => {
  it('lands exactly on A at t=0', () => {
    const { out, meta } = mesh(A, B, 0);
    const b = bounds(out);
    expect(b.x0).toBeCloseTo(A.x, 4);
    expect(b.x1).toBeCloseTo(A.x + A.w, 4);
    expect(b.y0).toBeCloseTo(A.y, 4);
    expect(b.y1).toBeCloseTo(A.y + A.h, 4);
    expect(meta[0]).toBeCloseTo(240, 6);
    expect(meta[1]).toBeCloseTo(240, 6);
    expect(meta[2]).toBe(16);
    const tl = vert(out, 0, 0);
    expect([tl.x, tl.y, tl.u, tl.v]).toEqual([A.x, A.y, 0, 0]);
    const br = vert(out, ALONG, ACROSS);
    expect([br.u, br.v]).toEqual([1, 1]);
  });
  it('lands exactly on B at t=1', () => {
    const { out, meta } = mesh(A, B, 1);
    const b = bounds(out);
    expect(b.x0).toBeCloseTo(B.x, 4);
    expect(b.x1).toBeCloseTo(B.x + B.w, 4);
    expect(b.y0).toBeCloseTo(B.y, 4);
    expect(b.y1).toBeCloseTo(B.y + B.h, 4);
    expect(meta[2]).toBe(12);
  });
  it('lands on both boxes in every direction, with the image upright', () => {
    const dirs: [number, number][] = [[-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    for (const [dx, dy] of dirs) {
      const b: GenieBox = { x: A.x + 500 * dx + 200 * dy * dy * 0, y: A.y + 500 * dy + (dx ? 30 : 0), w: 144, h: 144, r: 12 };
      const m0 = mesh(A, b, 0);
      // The vertex showing the image's top-left sits on the box's top-left; bottom-right on bottom-right.
      const at = (out: Float32Array, u: number, v: number) => {
        for (let i = 0; i < out.length; i += VERTEX_FLOATS)
          if (out[i + 2] === u && out[i + 3] === v) return { x: out[i], y: out[i + 1] };
        throw new Error('no such corner');
      };
      const tl = at(m0.out, 0, 0);
      const br = at(m0.out, 1, 1);
      expect(tl.x).toBeCloseTo(A.x, 4);
      expect(tl.y).toBeCloseTo(A.y, 4);
      expect(br.x).toBeCloseTo(A.x + A.w, 4);
      expect(br.y).toBeCloseTo(A.y + A.h, 4);
      const m1 = mesh(A, b, 1);
      const bb = bounds(m1.out);
      expect(bb.x0).toBeCloseTo(b.x, 4);
      expect(bb.y1).toBeCloseTo(b.y + b.h, 4);
    }
  });
  it('actually warps in between: a neck narrower than either box, and rows off the straight line', () => {
    const { out } = mesh(A, B, 0.5);
    let narrowest = Infinity;
    for (let r = 0; r <= ALONG; r++) {
      const a = vert(out, r, 0);
      const b = vert(out, r, ACROSS);
      narrowest = Math.min(narrowest, Math.hypot(a.x - b.x, a.y - b.y));
    }
    expect(narrowest).toBeLessThan(144 * 0.6);
    const ys = Array.from({ length: ALONG + 1 }, (_, r) => vert(out, r, ACROSS / 2).y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20);
  });
  it('moves smoothly: no row jumps further than a small step between neighbouring t', () => {
    let prev = mesh(A, B, 0).out;
    for (let i = 1; i <= 100; i++) {
      const cur = mesh(A, B, i / 100).out;
      let worst = 0;
      for (let k = 0; k < cur.length; k += VERTEX_FLOATS)
        worst = Math.max(worst, Math.hypot(cur[k] - prev[k], cur[k + 1] - prev[k + 1]));
      expect(worst).toBeLessThan(60);
      prev = cur;
    }
  });
  it('never produces NaN, even for zero, tiny or coincident boxes', () => {
    const z: GenieBox = { x: 0, y: 0, w: 0, h: 0, r: 0 };
    const tiny: GenieBox = { x: 5, y: 5, w: 1e-9, h: 1e-9, r: 3 };
    const nan: GenieBox = { x: NaN, y: 0, w: NaN, h: 4, r: NaN };
    for (const [a, b] of [[z, z], [A, z], [z, B], [tiny, tiny], [A, A], [A, { ...A, x: A.x + 1 }], [nan, B]] as const)
      for (const t of [-1, 0, 0.001, 0.5, 0.999, 1, 2, NaN]) {
        const { out, meta } = mesh(a, b, t);
        expect(out.every(Number.isFinite)).toBe(true);
        expect(Array.from(meta).every(Number.isFinite)).toBe(true);
      }
  });
  it('indexes every cell with in-range vertices', () => {
    const idx = meshIndices();
    expect(idx.length).toBe(ALONG * ACROSS * 6);
    expect(Math.max(...idx)).toBe(VERTEX_COUNT - 1);
  });
});

describe('tFromScroll', () => {
  const bar = 56;
  const h = 300;
  it('is 0 while the cover is clear of the bar, and 1 once it is fully under it', () => {
    expect(tFromScroll(bar + 200, h, bar)).toBe(0);
    expect(tFromScroll(bar + 0.25 * h, h, bar)).toBe(0);
    expect(tFromScroll(bar - h, h, bar)).toBe(1);
    expect(tFromScroll(-1000, h, bar)).toBe(1);
  });
  it('rises monotonically as the cover scrolls up, over about its height', () => {
    let prev = -1;
    for (let top = bar + 100; top >= bar - h; top -= 5) {
      const t = tFromScroll(top, h, bar);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(tFromScroll(bar, h, bar)).toBeGreaterThan(0.1);
    expect(tFromScroll(bar, h, bar)).toBeLessThan(0.3);
  });
  it('is safe for degenerate input', () => {
    for (const v of [tFromScroll(0, 0, 0), tFromScroll(NaN, 10, 5), tFromScroll(1, -5, 5), tFromScroll(1, 10, NaN)])
      expect(v).toBe(0);
  });
});
