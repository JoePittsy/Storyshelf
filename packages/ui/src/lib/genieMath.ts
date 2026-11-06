/**
 * The maths behind the genie warp: a cover pours along an S-shaped spine from one box to another, squeezing through a
 * neck. Everything here is pure and allocation-free per call (callers pass preallocated output arrays), so a renderer
 * can rebuild the mesh every frame.
 *
 * Coordinates are viewport pixels. The path runs from the centre of box A to the centre of box B along a dominant axis
 * (horizontal or vertical). It starts and ends with a straight run along that axis (half of each box's extent), so at
 * the ends the cross-sections are axis-aligned and the mesh lands exactly on the boxes. `q` is the distance along the
 * path measured from A's centre; the path is extended straight beyond both ends.
 */

/** A rectangle with a uniform corner radius, in viewport pixels. */
export type GenieBox = { x: number; y: number; w: number; h: number; r: number };

/** Mesh resolution: segments along the spine, and across it. */
export const ALONG = 64;
export const ACROSS = 8;
/** Floats per vertex: x, y, u, v. */
export const VERTEX_FLOATS = 4;
export const VERTEX_COUNT = (ALONG + 1) * (ACROSS + 1);
/** The narrowest the neck gets, as a fraction of the smaller box's cross-section. */
export const NECK = 0.42;

const LUT = 64;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fin = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export type Spine = {
  /** Unit axis of travel (one of four directions). */
  ax: number;
  ay: number;
  /** Centre of A, and the cubic's four control points (x0 y0 x1 y1 x2 y2 x3 y3). */
  cx: number;
  cy: number;
  cp: Float64Array;
  /** Cumulative arc length at LUT+1 evenly spaced cubic parameters. */
  lut: Float64Array;
  /** Half of A's extent along the axis, and the curved part's length. */
  startRun: number;
  curve: number;
  /** Total length from A's centre to B's centre. */
  length: number;
  /** A and B's extents along the axis and across it; corner radii. */
  a: number;
  b: number;
  wA: number;
  wB: number;
  rA: number;
  rB: number;
};

export function createSpine(): Spine {
  return {
    ax: 1, ay: 0, cx: 0, cy: 0, cp: new Float64Array(8), lut: new Float64Array(LUT + 1),
    startRun: 0, curve: 0, length: 0, a: 0, b: 0, wA: 0, wB: 0, rA: 0, rB: 0,
  };
}

/** Rebuild the spine for two boxes. The axis is whichever of horizontal/vertical the boxes are further apart on. */
export function setSpine(s: Spine, A: GenieBox, B: GenieBox): Spine {
  const w1 = fin(A.w);
  const h1 = fin(A.h);
  const w2 = fin(B.w);
  const h2 = fin(B.h);
  const num = (n: number) => (Number.isFinite(n) ? n : 0);
  const ax0 = num(A.x) + w1 / 2;
  const ay0 = num(A.y) + h1 / 2;
  const dx = num(B.x) + w2 / 2 - ax0;
  const dy = num(B.y) + h2 / 2 - ay0;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  s.ax = horizontal ? (dx < 0 ? -1 : 1) : 0;
  s.ay = horizontal ? 0 : dy < 0 ? -1 : 1;
  s.cx = ax0;
  s.cy = ay0;
  s.a = horizontal ? w1 : h1;
  s.b = horizontal ? w2 : h2;
  s.wA = horizontal ? h1 : w1;
  s.wB = horizontal ? h2 : w2;
  s.rA = fin(A.r);
  s.rB = fin(B.r);
  const along = horizontal ? Math.abs(dx) : Math.abs(dy);
  s.startRun = s.a / 2;
  // The cubic runs between A's exit edge and B's entry edge, leaving and arriving along the axis.
  const gap = Math.max(0, along - (s.a + s.b) / 2);
  const x0 = ax0 + s.ax * s.startRun;
  const y0 = ay0 + s.ay * s.startRun;
  const x3 = ax0 + dx - s.ax * (s.b / 2);
  const y3 = ay0 + dy - s.ay * (s.b / 2);
  const h = gap * 0.5;
  const cp = s.cp;
  cp[0] = x0;
  cp[1] = y0;
  cp[2] = x0 + s.ax * h;
  cp[3] = y0 + s.ay * h;
  cp[4] = x3 - s.ax * h;
  cp[5] = y3 - s.ay * h;
  cp[6] = x3;
  cp[7] = y3;
  let px = x0;
  let py = y0;
  let sum = 0;
  s.lut[0] = 0;
  for (let i = 1; i <= LUT; i++) {
    cubic(cp, i / LUT);
    sum += Math.hypot(cx_ - px, cy_ - py);
    px = cx_;
    py = cy_;
    s.lut[i] = sum;
  }
  s.curve = sum;
  s.length = s.startRun + sum + s.b / 2;
  return s;
}

// Scratch for cubic(): module-level so evaluation allocates nothing.
let cx_ = 0;
let cy_ = 0;
let dx_ = 0;
let dy_ = 0;
function cubic(cp: Float64Array, u: number) {
  const m = 1 - u;
  const a = m * m * m;
  const b = 3 * m * m * u;
  const c = 3 * m * u * u;
  const d = u * u * u;
  cx_ = a * cp[0] + b * cp[2] + c * cp[4] + d * cp[6];
  cy_ = a * cp[1] + b * cp[3] + c * cp[5] + d * cp[7];
  const da = 3 * m * m;
  const db = 6 * m * u;
  const dc = 3 * u * u;
  dx_ = da * (cp[2] - cp[0]) + db * (cp[4] - cp[2]) + dc * (cp[6] - cp[4]);
  dy_ = da * (cp[3] - cp[1]) + db * (cp[5] - cp[3]) + dc * (cp[7] - cp[5]);
}

/**
 * The point and unit tangent at distance `q` from A's centre: out = [x, y, tx, ty]. Straight (along the axis) before
 * the curve and after it, so q may be any number.
 */
export function spineAt(s: Spine, q: number, out: Float64Array): void {
  const qc = q - s.startRun;
  if (qc >= s.curve) {
    out[0] = s.cp[6] + s.ax * (qc - s.curve);
    out[1] = s.cp[7] + s.ay * (qc - s.curve);
    out[2] = s.ax;
    out[3] = s.ay;
    return;
  }
  if (qc <= 0) {
    out[0] = s.cp[0] + s.ax * qc;
    out[1] = s.cp[1] + s.ay * qc;
    out[2] = s.ax;
    out[3] = s.ay;
    return;
  }
  // Binary search the arc-length table, then interpolate within the cell.
  let lo = 0;
  let hi = LUT;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.lut[mid] <= qc) lo = mid;
    else hi = mid;
  }
  const span = s.lut[hi] - s.lut[lo];
  const u = (lo + (span > 1e-12 ? (qc - s.lut[lo]) / span : 0)) / LUT;
  cubic(s.cp, u);
  out[0] = cx_;
  out[1] = cy_;
  const n = Math.hypot(dx_, dy_);
  out[2] = n > 1e-9 ? dx_ / n : s.ax;
  out[3] = n > 1e-9 ? dy_ / n : s.ay;
}

/**
 * The window of the path the image's rows occupy: out = [q0, q1] (trailing and leading edge). At t=0 it is exactly A's
 * extent; at t=1 exactly B's. Early the leading edge runs ahead towards B; late the trailing edge drains out of A.
 */
export function genieWindow(s: Spine, t: number, out: Float64Array): void {
  t = clamp01(Number.isFinite(t) ? t : 0);
  const lead = smooth(clamp01(t / 0.7));
  const trail = smooth(clamp01((t - 0.3) / 0.7));
  out[0] = lerp(-s.a / 2, s.length - s.b / 2, trail);
  out[1] = lerp(s.a / 2, s.length + s.b / 2, lead);
}

/** The cross-section's full width at distance `q`: A's size, then B's, pinched to a neck between them. */
export function genieWidth(s: Spine, q: number): number {
  const x = s.curve > 1e-9 ? clamp01((q - s.startRun) / s.curve) : 0;
  const base = lerp(s.wA, s.wB, smooth(x));
  const neck = NECK * Math.min(s.wA, s.wB);
  const bump = Math.sin(Math.PI * x) ** 1.3;
  return Math.max(0, lerp(base, Math.min(neck, base), bump));
}

/** Per-frame values the shader needs: extent of the image along and across (px), and the corner radius (px). */
export const META_FLOATS = 3;

/**
 * Fill `out` (ALONG+1 rows by ACROSS+1 columns, VERTEX_FLOATS each) with the warped mesh at progress t. Positions are
 * viewport pixels; u/v index the image so that columns run across the spine and rows along it, upright at the ends.
 * `meta` receives [extent along, extent across, corner radius].
 */
const P = new Float64Array(4);
export function buildMesh(s: Spine, t: number, out: Float32Array, meta: Float64Array): void {
  t = clamp01(Number.isFinite(t) ? t : 0);
  const W = genieWindowScratch;
  genieWindow(s, t, W);
  const q0 = W[0];
  const q1 = W[1];
  const horizontal = s.ax !== 0;
  const sign = horizontal ? s.ax : s.ay;
  const k = horizontal ? sign : -sign;
  let widthSum = 0;
  let i = 0;
  for (let row = 0; row <= ALONG; row++) {
    const v = row / ALONG;
    const q = q0 + (q1 - q0) * v;
    spineAt(s, q, P);
    const w = genieWidth(s, q);
    widthSum += w;
    // Normal: the tangent turned a quarter, signed so it equals the image's cross direction at the ends.
    const nx = k * -P[3];
    const ny = k * P[2];
    const along = sign > 0 ? v : 1 - v;
    for (let col = 0; col <= ACROSS; col++) {
      const c = col / ACROSS;
      const off = (c - 0.5) * w;
      out[i++] = P[0] + nx * off;
      out[i++] = P[1] + ny * off;
      out[i++] = horizontal ? along : c;
      out[i++] = horizontal ? c : along;
    }
  }
  const length = q1 - q0;
  const cross = widthSum / (ALONG + 1);
  meta[0] = horizontal ? length : cross;
  meta[1] = horizontal ? cross : length;
  meta[2] = lerp(s.rA, s.rB, t);
}
const genieWindowScratch = new Float64Array(2);

/** Triangle indices for the mesh, shared by every frame. */
export function meshIndices(): Uint16Array {
  const idx = new Uint16Array(ALONG * ACROSS * 6);
  let n = 0;
  for (let r = 0; r < ALONG; r++)
    for (let c = 0; c < ACROSS; c++) {
      const a = r * (ACROSS + 1) + c;
      const b = a + 1;
      const d = a + ACROSS + 1;
      const e = d + 1;
      idx[n++] = a;
      idx[n++] = b;
      idx[n++] = d;
      idx[n++] = b;
      idx[n++] = e;
      idx[n++] = d;
    }
  return idx;
}

/**
 * Progress from scroll geometry. 0 while the cover is fully clear of the bar (with `lead` x its height of run-in);
 * 1 once it has scrolled fully under it. In between it follows the cover's top edge linearly, so the warp spans
 * (1 + lead) x the cover's height of scrolling.
 */
export function tFromScroll(top: number, height: number, barBottom: number, lead = 0.25): number {
  if (!(height > 0) || !Number.isFinite(top) || !Number.isFinite(barBottom)) return 0;
  const run = lead * height;
  return clamp01((barBottom + run - top) / (height + run));
}
