/** A rectangle with a uniform corner radius, in viewport pixels. */
export type MorphBox = { x: number; y: number; w: number; h: number; r: number };

export type MorphShape = {
  /** The whole liquid blob as one closed path (M, C and Z only): two rounded squares joined by two cubic S-curves. */
  d: string;
  /** The source square's current box (it holds still, then travels into the target). */
  from: MorphBox;
  /** The target square's current box (it grows out of the source, then holds still). */
  to: MorphBox;
  /** 0..1 opacity of the source and target cover images. */
  fromOpacity: number;
  toOpacity: number;
  /** Centre of `from` then centre of `to` (x1, y1, x2, y2), for orienting the bridge's gradient. */
  axis: [number, number, number, number];
};

const KAPPA = 0.5522847498;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const range = (t: number, a: number, b: number) => smooth(clamp01((t - a) / (b - a)));
const lerpBox = (a: MorphBox, b: MorphBox, t: number): MorphBox => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  r: lerp(a.r, b.r, t),
});

type Pt = [number, number];

/** Where the bridge's lower edge meets the source square's bottom edge, as a fraction of its width (0 = bottom-left). */
const BOTTOM_START = 0.78;
/** Where it joins the target square's bottom edge, as a fraction of its width. */
const BOTTOM_END = 0.28;
/** How much of a connector's horizontal run its S-curve handles use. */
const HANDLE = 0.55;

/**
 * The liquid-bridge shape at progress `t` (0 = just the `a` square, 1 = just the `b` square; apply easing before
 * calling). The target square leaves `a` and settles on `b` by t=0.5, joined to the source by two S-curves: one from the
 * source's top-right corner to the target's top-left corner, one from the target's bottom-left corner to the source's
 * bottom edge. Then the source drains into `b`. Works in any direction: the layout is mirrored so `b` always lies
 * down and to the right of `a`, and mirrored back on the way out.
 */
export function morphShape(a: MorphBox, b: MorphBox, t: number): MorphShape {
  t = clamp01(t);
  const fx = b.x + b.w / 2 >= a.x + a.w / 2 ? 1 : -1;
  const fy = b.y + b.h / 2 >= a.y + a.h / 2 ? 1 : -1;
  // Mirroring a box is its own inverse.
  const mirror = (box: MorphBox): MorphBox => ({
    ...box,
    x: fx > 0 ? box.x : -(box.x + box.w),
    y: fy > 0 ? box.y : -(box.y + box.h),
  });
  const A = mirror(a);
  const B = mirror(b);

  const u = range(t, 0, 0.5); // the target emerges
  const v = range(t, 0.5, 1); // the source drains
  const P = lerpBox(A, B, v);
  const Q = lerpBox(A, B, u);
  const rP = Math.min(P.r, P.w / 2, P.h / 2);
  const rQ = Math.min(Q.r, Q.w / 2, Q.h / 2);

  // How far apart the squares are against how far apart they end up: 0 when they coincide.
  const dist = Math.hypot(B.x + B.w / 2 - (A.x + A.w / 2), B.y + B.h / 2 - (A.y + A.h / 2)) || 1;
  const apart = Math.hypot(Q.x + Q.w / 2 - (P.x + P.w / 2), Q.y + Q.h / 2 - (P.y + P.h / 2)) / dist;
  const s = range(apart, 0, 0.35);

  // Top connector: source top edge -> target top edge. Both ends sit on the shared midpoint when s = 0.
  let sx = P.x + P.w * lerp(0.5, 1 - rP / P.w, s);
  let ex = Q.x + Q.w * lerp(0.5, rQ / Q.w, s);
  if (ex < sx) sx = ex = (sx + ex) / 2; // still overlapping: a smooth step, never a backwards loop
  // Bottom connector: target bottom edge -> source bottom edge, walked right to left.
  let gx = P.x + P.w * lerp(0.5, Math.max(BOTTOM_START, rP / P.w), s);
  let fb = Q.x + Q.w * lerp(0.5, Math.max(BOTTOM_END, rQ / Q.w), s);
  if (fb < gx) gx = fb = (gx + fb) / 2;

  const handle = (run: number, rise: number) => Math.max(run * HANDLE, s * Math.min(Math.abs(rise), P.w) * 0.35);
  const hTop = handle(ex - sx, Q.y - P.y);
  const hBot = handle(fb - gx, Q.y + Q.h - (P.y + P.h));

  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  const pt = ([x, y]: Pt) => `${fmt(fx > 0 ? x : -x)} ${fmt(fy > 0 ? y : -y)}`;
  let cur: Pt = [P.x + rP, P.y];
  let d = `M ${pt(cur)}`;
  const curve = (c1: Pt, c2: Pt, to: Pt) => {
    d += ` C ${pt(c1)} ${pt(c2)} ${pt(to)}`;
    cur = to;
  };
  const line = (to: Pt) =>
    curve(
      [lerp(cur[0], to[0], 1 / 3), lerp(cur[1], to[1], 1 / 3)],
      [lerp(cur[0], to[0], 2 / 3), lerp(cur[1], to[1], 2 / 3)],
      to
    );
  const k = (r: number) => r * KAPPA;
  const right = Q.x + Q.w;
  const bottomQ = Q.y + Q.h;
  const bottomP = P.y + P.h;

  line([sx, P.y]);
  curve([sx + hTop, P.y], [ex - hTop, Q.y], [ex, Q.y]);
  line([right - rQ, Q.y]);
  curve([right - rQ + k(rQ), Q.y], [right, Q.y + rQ - k(rQ)], [right, Q.y + rQ]);
  line([right, bottomQ - rQ]);
  curve([right, bottomQ - rQ + k(rQ)], [right - rQ + k(rQ), bottomQ], [right - rQ, bottomQ]);
  line([fb, bottomQ]);
  curve([fb - hBot, bottomQ], [gx + hBot, bottomP], [gx, bottomP]);
  line([P.x + rP, bottomP]);
  curve([P.x + rP - k(rP), bottomP], [P.x, bottomP - rP + k(rP)], [P.x, bottomP - rP]);
  line([P.x, P.y + rP]);
  curve([P.x, P.y + rP - k(rP)], [P.x + rP - k(rP), P.y], [P.x + rP, P.y]);
  d += ' Z';

  const from = mirror(P);
  const to = mirror(Q);
  return {
    d,
    from,
    to,
    fromOpacity: 1 - v,
    toOpacity: u,
    axis: [from.x + from.w / 2, from.y + from.h / 2, to.x + to.w / 2, to.y + to.h / 2],
  };
}

/** Just the path, for callers (and tests) that do not need the boxes. */
export const morphPath = (a: MorphBox, b: MorphBox, t: number): string => morphShape(a, b, t).d;
