import { morphShape, type MorphBox } from './morphPath';

const SVG = 'http://www.w3.org/2000/svg';
/** Above page content, below the TopBar (z-index 10) and anything that sits over it. */
const OVERLAY_Z = 9;

export type MorphOptions = {
  /** The cover image. Defaults to the first `<img>` inside `from`, then inside `to`. */
  src?: string;
  /** The cover's dominant colour, as `r, g, b` or any CSS colour. Fills the bridge; defaults to the `--bg-1` token. */
  color?: string;
  /** Milliseconds; default 450. */
  duration?: number;
  /** Aborting jumps to the end state: the overlay goes and the real elements come back. */
  signal?: AbortSignal;
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** An element's box in viewport pixels, with its (clamped) border radius; null when it has no layout. */
export function measureBox(el: Element): MorphBox | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const raw = getComputedStyle(el).borderTopLeftRadius;
  const n = parseFloat(raw) || 0;
  const radius = raw.endsWith('%') ? (n / 100) * Math.min(r.width, r.height) : n;
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: radius };
}

const toCssColor = (color: string | undefined) => {
  if (!color) return 'var(--bg-1, #1b2433)';
  return /^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(color) ? `rgb(${color})` : color;
};

let counter = 0;

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, parent?: Element) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
}

/**
 * A fixed full-viewport SVG showing the liquid bridge between two boxes. `update` redraws it at progress `t`
 * (0 = box `a`, 1 = box `b`); `destroy` removes it. `morphBetween` drives it; stories use it directly to pin a frame.
 */
export function createMorphOverlay({ src, color }: { src?: string; color?: string } = {}) {
  const id = `morph-${++counter}`;
  const css = toCssColor(color);
  const svg = node('svg', { 'aria-hidden': 'true' });
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(OVERLAY_Z),
    overflow: 'hidden',
  });
  const defs = node('defs', {}, svg);
  const grad = node('linearGradient', { id: `${id}-g`, gradientUnits: 'userSpaceOnUse' }, defs);
  const stops: [string, string][] = [
    ['0', `color-mix(in srgb, ${css} 72%, white)`],
    ['0.5', css],
    ['1', `color-mix(in srgb, ${css} 72%, white)`],
  ];
  for (const [offset, c] of stops) node('stop', { offset, style: `stop-color:${c}` }, grad);
  const blur = node('filter', { id: `${id}-b`, x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
  node('feGaussianBlur', { stdDeviation: '10' }, blur);

  const path = node('path', { fill: `url(#${id}-g)` }, svg);
  // The images are also clipped to the blob, so a half-faded square never shows outside the liquid.
  const blobClip = node('path', {}, node('clipPath', { id: `${id}-blob` }, defs));
  const covers = node('g', { 'clip-path': `url(#${id}-blob)` }, svg);

  const square = (name: string) => {
    const clip = node('clipPath', { id: `${id}-${name}` }, defs);
    const clipRect = node('rect', {}, clip);
    const g = node('g', { 'clip-path': `url(#${id}-${name})` }, covers);
    let images: SVGImageElement[] = [];
    if (src) {
      // A blurred copy fills behind the contained cover, matching the artwork's own contain treatment.
      const fill = node('image', { href: src, preserveAspectRatio: 'xMidYMid slice', filter: `url(#${id}-b)` }, g);
      const art = node('image', { href: src, preserveAspectRatio: 'xMidYMid meet' }, g);
      images = [fill, art];
    }
    return { g, clipRect, images };
  };
  const from = square('from');
  const to = square('to');
  document.body.appendChild(svg);

  const place = (sq: ReturnType<typeof square>, box: MorphBox, opacity: number) => {
    const set = (el: Element, a: Record<string, number>) => {
      for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(Math.round(v * 100) / 100));
    };
    set(sq.clipRect, { x: box.x, y: box.y, width: box.w, height: box.h, rx: box.r, ry: box.r });
    for (const img of sq.images) set(img, { x: box.x, y: box.y, width: box.w, height: box.h });
    sq.g.setAttribute('opacity', String(Math.round(opacity * 1000) / 1000));
  };

  return {
    element: svg,
    update(a: MorphBox, b: MorphBox, t: number) {
      const shape = morphShape(a, b, t);
      path.setAttribute('d', shape.d);
      blobClip.setAttribute('d', shape.d);
      const [x1, y1, x2, y2] = shape.axis;
      for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) grad.setAttribute(k, String(v));
      place(from, shape.from, shape.fromOpacity);
      place(to, shape.to, shape.toOpacity);
    },
    destroy: () => svg.remove(),
  };
}

/**
 * Pour the cover from `from` to `to` like liquid: a bridge of S-curves joins the two squares, then drains into the
 * target. Both elements are hidden for the duration and measured every frame, so the morph follows them if the page
 * scrolls. Resolves when done, and immediately (with no animation) under reduced motion or when either element has no
 * layout. Aborting the signal jumps to the end.
 */
export function morphBetween(from: Element, to: Element, opts: MorphOptions = {}): Promise<void> {
  const { duration = 450, signal } = opts;
  if (signal?.aborted || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  let a = measureBox(from);
  let b = measureBox(to);
  if (!a || !b) return Promise.resolve();
  const src =
    opts.src ??
    from.querySelector<HTMLImageElement>('img:not([aria-hidden])')?.currentSrc ??
    to.querySelector<HTMLImageElement>('img:not([aria-hidden])')?.currentSrc ??
    undefined;

  return new Promise((resolve) => {
    const hidden = [from, to].filter((el): el is HTMLElement => el instanceof HTMLElement);
    const saved = hidden.map((el) => el.style.visibility);
    for (const el of hidden) el.style.visibility = 'hidden';
    const overlay = createMorphOverlay({ src, color: opts.color });
    overlay.update(a!, b!, 0);

    let raf = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      signal?.removeEventListener('abort', finish);
      overlay.destroy();
      hidden.forEach((el, i) => (el.style.visibility = saved[i]));
      resolve();
    };
    signal?.addEventListener('abort', finish);

    const start = performance.now();
    const frame = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - start) / duration);
      if (from.isConnected) a = measureBox(from) ?? a;
      if (to.isConnected) b = measureBox(to) ?? b;
      overlay.update(a!, b!, ease(p));
      if (p >= 1) return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}
