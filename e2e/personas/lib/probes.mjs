// Probes that every persona script wanted and kept writing badly: what is on screen, where the book is, how big the
// touch targets really are, and a screenshot. They read the page; they never press anything (position() is the one
// exception, and it puts back what it changed).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outs = new WeakMap();
/** Remembers a page's output folder, so shot(page, name) needs no extra argument. */
export const registerOut = (page, dir) => outs.set(page, dir);

const clean = (s) => String(s ?? '').replace(/[​\s]+/g, ' ').trim();

/**
 * What a person (or a screen reader) would have in front of them, as plain data:
 *  - `main`    the visible text of <main>
 *  - `nowPlaying` the visible text of the "Now playing" region (the mini player)
 *  - `live`    the text of every live region that has any: [role=status], [role=alert], [aria-live]. Visually hidden
 *              ones count, because that is the point of a live region.
 *  - `focus`   the role and accessible name of document.activeElement, as the browser computes them (via the
 *              accessibility snapshot, not a guess)
 */
export async function snapshot(page) {
  const dom = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const text = (el) => (el && visible(el) ? el.innerText : '');
    const main = document.querySelector('main');
    const now = [...document.querySelectorAll('[aria-label="Now playing"]')].find(visible);
    const live = [...document.querySelectorAll('[role=status], [role=alert], [aria-live]')]
      .map((el) => ({ role: el.getAttribute('role') || `aria-live=${el.getAttribute('aria-live')}`, text: el.textContent }))
      .filter((l) => l.text && l.text.trim());
    const a = document.activeElement;
    return {
      main: text(main),
      nowPlaying: text(now),
      live,
      focusTag: a && a !== document.body ? a.tagName.toLowerCase() : 'body',
      title: document.title,
      path: location.pathname + location.search,
    };
  });
  let focus = { role: 'none', name: '' };
  if (dom.focusTag !== 'body') {
    // The browser's own accessible name for the focused element, e.g `- button "Play"`.
    const yaml = await page.locator(':focus').first().ariaSnapshot({ timeout: 2000 }).catch(() => '');
    const m = /^- '?([\w-]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(yaml.trim());
    focus = m ? { role: m[1], name: (m[2] ?? '').replace(/\\"/g, '"') } : { role: dom.focusTag, name: '' };
  }
  return {
    path: dom.path,
    title: dom.title,
    main: clean(dom.main),
    nowPlaying: clean(dom.nowPlaying),
    live: dom.live.map((l) => ({ role: l.role, text: clean(l.text) })).filter((l) => l.text),
    focus,
  };
}

/** Seconds from "1:02:03 of 14:00:00, Chapter 1: …": the clock before " of ". NaN when it isn't in that form. */
const clockSeconds = (text) => {
  const m = /^(\d+(?::\d{1,2}){1,2}) of (\d+(?::\d{1,2}){1,2})/.exec(text ?? '');
  const secs = (s) => s.split(':').reduce((t, part) => t * 60 + Number(part), 0);
  return m ? { at: secs(m[1]), of: secs(m[2]) } : null;
};

/** "Progress bar shows" is a radio group; found by role, so it doesn't matter how it is drawn. */
const checked = async (el) => (await el.getAttribute('aria-checked')) === 'true' || (await el.getAttribute('aria-selected')) === 'true';

/**
 * Where the book is, in seconds from its start, or NaN when it can't be told.
 *
 * Source: the progress slider's aria-valuetext ("1:02:03 of 14:00:00, Chapter 1"), on the player page or, failing that,
 * the mini player's slider. That text is only a book position in the "Whole book" window. In "This chapter" it counts
 * from the chapter's start, and while a sleep timer is armed the app switches the bar to a "Sleep" window: a
 * progressbar reading "Stops in 14:52" with no position in it at all.
 *
 * So: when the player page shows its "Progress bar shows" switch and Whole book isn't on, this selects it, reads, and
 * puts the previous choice back. With no switch to use (the mini player on other pages), it trusts the text only if the
 * total after "of" matches `duration` (pass the book's length in seconds, from lib/abs.mjs); in another window it
 * returns NaN rather than a wrong number. Stay on /now-playing while a timer is armed.
 */
export async function position(page, { duration } = {}) {
  const slider = page.getByRole('slider', { name: /^Progress through / }).first();
  const read = async () => {
    // Right after a load the bar has no length yet and no text: give it a moment before calling it unreadable.
    for (let i = 0; i < 15; i++) {
      const t = (await slider.count()) ? clockSeconds(await slider.getAttribute('aria-valuetext')) : null;
      if (t) return duration && Math.abs(t.of - duration) > 2 ? NaN : t.at;
      await new Promise((r) => setTimeout(r, 200));
    }
    return NaN;
  };
  const whole = page.getByRole('radio', { name: 'Whole book' }).first();
  if (!(await whole.isVisible().catch(() => false))) return read();
  if (await checked(whole)) return read();
  const options = page.getByRole('radiogroup', { name: 'Progress bar shows' }).first().getByRole('radio');
  let before = null;
  for (let i = 0; i < (await options.count()); i++) if (await checked(options.nth(i))) before = options.nth(i);
  await whole.click();
  await slider.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
  const seconds = await read();
  if (before) await before.click().catch(() => undefined);
  return seconds;
}

/**
 * Every visible button, link and form control with its accessible name and size, and whether it is under 44×44 CSS
 * pixels (PRODUCT.md's bar for the phone; on desktop it is information, not a failure).
 *
 * Some controls are small to look at but have a bigger hit area, made with a ::before/::after (or padding) that
 * reaches past the visible box. Calling those "too small" would be a false finding, and trusting the CSS would hide a
 * real one, so the hit area is measured, not read: for any control under 44 in either direction this samples
 * document.elementFromPoint on a 2px grid around it (up to 24px out) and takes the extent of the points that land on
 * the control or something inside it. `w`/`h` are the visible box; `hitW`/`hitH` are that measured extent. A control
 * counts as small only if its hit area is. Limits: only controls inside the viewport can be sampled (others report
 * `measured: false` and their visible box stands); a control that something else overlaps reads smaller than it is.
 * The accessible name here is a close approximation (aria-label, aria-labelledby, text, title, alt), not the
 * browser's own algorithm.
 */
export async function tapTargets(page) {
  return page.evaluate(() => {
    const MIN = 44;
    const SELECTOR =
      'a[href], button, [role=button], [role=link], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=slider], [role=menuitem], input:not([type=hidden]), select, textarea, summary';
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const nameOf = (el) => {
      const lab = el.getAttribute('aria-label');
      if (lab) return lab.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
        if (t) return t;
      }
      if (el.labels?.length) return [...el.labels].map((l) => l.textContent).join(' ').trim();
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      return text || el.getAttribute('title') || el.getAttribute('alt') || el.querySelector('img[alt]')?.getAttribute('alt') || '';
    };
    const roleOf = (el) => el.getAttribute('role') || { A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button' }[el.tagName] || (el.tagName === 'INPUT' ? ({ checkbox: 'checkbox', radio: 'radio', range: 'slider', search: 'searchbox' }[el.type] ?? 'textbox') : el.tagName.toLowerCase());
    const vw = innerWidth;
    const vh = innerHeight;
    const hits = (el, x, y) => {
      const t = document.elementFromPoint(x, y);
      return !!t && (t === el || el.contains(t));
    };
    const out = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const box = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      const inView = r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw;
      let hitW = box.w;
      let hitH = box.h;
      let measured = inView;
      if (inView && (box.w < MIN || box.h < MIN)) {
        const PAD = 24;
        const STEP = 2;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let y = Math.max(0, Math.floor(r.top - PAD)); y <= Math.min(vh - 1, Math.ceil(r.bottom + PAD)); y += STEP) {
          for (let x = Math.max(0, Math.floor(r.left - PAD)); x <= Math.min(vw - 1, Math.ceil(r.right + PAD)); x += STEP) {
            if (hits(el, x, y)) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x);
              minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
          }
        }
        if (maxX >= minX) {
          hitW = Math.max(box.w, maxX - minX + STEP);
          hitH = Math.max(box.h, maxY - minY + STEP);
        }
      } else if (!inView) {
        measured = false;
      }
      out.push({
        role: roleOf(el),
        name: nameOf(el),
        ...box,
        hitW,
        hitH,
        enlarged: hitW > box.w + 2 || hitH > box.h + 2,
        measured,
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        under44: hitW < MIN || hitH < MIN,
      });
    }
    return out;
  });
}

/** A screenshot into the run's output folder at CSS-pixel scale (a phone's 3× pixel ratio would triple the file). Returns its path. */
export async function shot(page, name) {
  const dir = outs.get(page);
  if (!dir) throw new Error('shot(): this page was not opened through openSession');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${String(name).replace(/[^\w.-]+/g, '-')}.png`);
  await page.screenshot({ path: file, scale: 'css' });
  return file;
}

/** Contrast of every distinct text colour on the page against what is behind it: computed styles, composited, never eyeballed. */
export async function contrast(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const cx = canvas.getContext('2d', { willReadFrequently: true });
    // Any CSS colour the browser understands (oklab, color-mix…) becomes plain sRGB + alpha this way.
    const rgba = (css) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = css;
      cx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const over = (top, under) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const lum = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /** The colour behind an element: its ancestors' backgrounds composited, or null if an image or gradient is in the way. */
    const behind = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.backgroundImage !== 'none') return null;
        const c = rgba(s.backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a === 1) break;
      }
      return layers.reduceRight((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
    };
    const seen = new Map();
    let unmeasured = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      const el = node.parentElement;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
      if (el.closest('select, option, script, style')) continue;
      const bg = behind(el);
      if (!bg) {
        unmeasured++;
        continue;
      }
      const fg = over(rgba(s.color), bg);
      const px = parseFloat(s.fontSize);
      const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const key = `${s.color}|${bg.r | 0},${bg.g | 0},${bg.b | 0}|${large}`;
      if (!seen.has(key)) seen.set(key, { text: node.nodeValue.trim().slice(0, 40), ratio: Math.round(ratio(fg, bg) * 100) / 100, need, fg: `rgb(${fg.r | 0} ${fg.g | 0} ${fg.b | 0})`, bg: `rgb(${bg.r | 0} ${bg.g | 0} ${bg.b | 0})`, px });
    }
    return { unmeasured, samples: [...seen.values()] };
  });
}

