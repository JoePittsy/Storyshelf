import {
  ALONG,
  ACROSS,
  META_FLOATS,
  VERTEX_COUNT,
  VERTEX_FLOATS,
  buildMesh,
  createSpine,
  meshIndices,
  setSpine,
  type GenieBox,
} from './genieMath';

/** Above page content, below the TopBar (z-index 10) and anything that sits over it. */
const CANVAS_Z = 9;
const TEXTURE = 1024;

/** An element's box in viewport pixels, with its (clamped) border radius; null when it has no layout. */
export function measureBox(el: Element): GenieBox | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const raw = getComputedStyle(el).borderTopLeftRadius;
  const n = parseFloat(raw) || 0;
  const radius = raw.endsWith('%') ? (n / 100) * Math.min(r.width, r.height) : n;
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: Math.min(radius, r.width / 2, r.height / 2) };
}

const VERT = `
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec2 uView;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0, 0.0, 1.0);
}`;
// Rounded corners as a signed distance in pixels; the half-pixel inflation keeps straight edges fully opaque.
const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uExt;
uniform float uRad;
varying vec2 vUv;
void main() {
  vec2 hb = 0.5 * uExt + 0.5;
  float r = min(uRad, min(hb.x, hb.y));
  vec2 q = abs((vUv - 0.5) * uExt) - hb + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float a = clamp(0.5 - d, 0.0, 1.0);
  vec4 c = texture2D(uTex, clamp(vUv, 0.0, 1.0));
  gl_FragColor = vec4(c.rgb * a, a);
}`;

export type Genie = {
  /** The fixed full-viewport canvas (aria-hidden, pointer-events none). */
  readonly canvas: HTMLCanvasElement;
  /** True once the image is decoded and uploaded; false if it failed, was tainted or the GL context was lost. */
  readonly ready: boolean;
  /** True when it can never draw (no WebGL, failed image, lost context): callers should swap instantly. */
  readonly failed: boolean;
  /** CPU milliseconds spent building the vertices on the last draw. */
  readonly lastBuildMs: number;
  /** Compose the texture for a box of this shape now (otherwise it happens on the first draw). Cheap if already done. */
  prepare(box: GenieBox): void;
  /** Draw the cover warped from box `a` to box `b` at progress t, and show the canvas. */
  draw(a: GenieBox, b: GenieBox, t: number): void;
  /** Clear and hide the canvas. */
  hide(): void;
  destroy(): void;
};

export type GenieOptions = {
  /** The cover image URL. Loaded with crossOrigin="anonymous"; a tainted or failed image sets `failed`. */
  src: string;
  /** Called when `ready` or `failed` changes. */
  onChange?: () => void;
  /** Where the canvas goes; default `document.body`. */
  parent?: HTMLElement;
};

/**
 * The cover as a texture in a WebGL mesh warped along the genie spine (see genieMath). Returns null when WebGL is not
 * available. The texture is the contained cover over a blurred, darkened copy of itself, matching `Artwork fit="contain"`.
 */
export function createGenie({ src, onChange, parent = document.body }: GenieOptions): Genie | null {
  const canvas = document.createElement('canvas');
  const opts = { antialias: true, premultipliedAlpha: true, alpha: true } as const;
  const gl = (canvas.getContext('webgl2', opts) ?? canvas.getContext('webgl', opts)) as WebGLRenderingContext | null;
  if (!gl) return null;

  const compile = (type: number, source: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const vertices = new Float32Array(VERTEX_COUNT * VERTEX_FLOATS);
  const meta = new Float64Array(META_FLOATS);
  const spine = createSpine();
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
  const stride = VERTEX_FLOATS * 4;
  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aUv = gl.getAttribLocation(prog, 'aUv');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 8);
  const indices = meshIndices();
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  const uView = gl.getUniformLocation(prog, 'uView');
  const uExt = gl.getUniformLocation(prog, 'uExt');
  const uRad = gl.getUniformLocation(prog, 'uRad');
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  gl.clearColor(0, 0, 0, 0);

  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(CANVAS_Z),
    display: 'none',
  });
  canvas.setAttribute('aria-hidden', 'true');
  parent.appendChild(canvas);

  let image: HTMLImageElement | null = null;
  let tex: WebGLTexture | null = null;
  let composedFor = '';
  let ready = false;
  let failed = false;
  let lastBuildMs = 0;
  let destroyed = false;
  let shown = false;
  const set = (next: { ready?: boolean; failed?: boolean }) => {
    const was = ready !== (next.ready ?? ready) || failed !== (next.failed ?? failed);
    ready = next.ready ?? ready;
    failed = next.failed ?? failed;
    if (was) onChange?.();
  };

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    image = img;
    onChange?.();
  };
  img.onerror = () => set({ failed: true });
  img.src = src;

  /** The contained cover over a blurred copy, drawn in the box's own proportions so it matches Artwork exactly. */
  const compose = (box: GenieBox) => {
    if (!image || destroyed || failed) return;
    const key = `${Math.round(box.w)}x${Math.round(box.h)}`;
    if (key === composedFor && tex) return;
    const c = document.createElement('canvas');
    c.width = c.height = TEXTURE;
    const ctx = c.getContext('2d');
    if (!ctx || !(box.w > 0) || !(box.h > 0)) return set({ failed: true });
    const kx = TEXTURE / box.w;
    const ky = TEXTURE / box.h;
    ctx.scale(kx, ky);
    const iw = image.naturalWidth || box.w;
    const ih = image.naturalHeight || box.h;
    const cover = Math.max(box.w / iw, box.h / ih) * 1.15;
    ctx.filter = `blur(${16 * kx}px) brightness(0.7)`;
    ctx.drawImage(image, (box.w - iw * cover) / 2, (box.h - ih * cover) / 2, iw * cover, ih * cover);
    ctx.filter = 'none';
    const fit = Math.min(box.w / iw, box.h / ih);
    ctx.drawImage(image, (box.w - iw * fit) / 2, (box.h - ih * fit) / 2, iw * fit, ih * fit);
    try {
      tex ??= gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); // throws on a tainted canvas
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      composedFor = key;
      set({ ready: true });
    } catch {
      set({ failed: true, ready: false });
    }
  };

  let bufW = 0;
  let bufH = 0;
  const onLost = (e: Event) => {
    e.preventDefault();
    set({ failed: true, ready: false });
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const hide = () => {
    if (!shown) return;
    shown = false;
    canvas.style.display = 'none';
  };

  return {
    canvas,
    get ready() {
      return ready;
    },
    get failed() {
      return failed || gl.isContextLost();
    },
    get lastBuildMs() {
      return lastBuildMs;
    },
    prepare: compose,
    draw(a, b, t) {
      if (destroyed || failed || gl.isContextLost()) return;
      compose(a);
      if (!ready) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      if (w !== bufW || h !== bufH) {
        bufW = canvas.width = w;
        bufH = canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uView, window.innerWidth, window.innerHeight);
      }
      const t0 = performance.now();
      setSpine(spine, a, b);
      buildMesh(spine, t, vertices, meta);
      lastBuildMs = performance.now() - t0;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.uniform2f(uExt, meta[0], meta[1]);
      gl.uniform1f(uRad, meta[2]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, ALONG * ACROSS * 6, gl.UNSIGNED_SHORT, 0);
      if (!shown) {
        shown = true;
        canvas.style.display = 'block';
      }
    },
    hide,
    destroy() {
      destroyed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      img.onload = img.onerror = null;
      if (tex) gl.deleteTexture(tex);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
