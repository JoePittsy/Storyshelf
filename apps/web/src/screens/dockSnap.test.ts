// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { tFromScroll } from '@joepittsy/ui';
import { DOCK_LEAD, snapToDockEnd } from './dockSnap';

// A cover 300px tall whose document top is 200px, under a 60px bar.
const H = 300;
const DOC_TOP = 200;
const BAR = 60;
const topAt = (y: number) => DOC_TOP - y;

describe('snapToDockEnd', () => {
  it('does nothing at either end', () => {
    expect(snapToDockEnd(topAt(0), H, BAR, 0, 5000).target).toBeNull();
    expect(snapToDockEnd(topAt(2000), H, BAR, 2000, 5000).target).toBeNull();
  });

  it('snaps back to t = 0 when less than half way, and forward to t = 1 when more', () => {
    const lo = snapToDockEnd(topAt(200), H, BAR, 200, 5000);
    expect(lo.t).toBeGreaterThan(0);
    expect(lo.t).toBeLessThan(0.5);
    const back = lo.target as number;
    expect(tFromScroll(topAt(back), H, BAR, DOCK_LEAD)).toBeCloseTo(0, 6);

    const hi = snapToDockEnd(topAt(400), H, BAR, 400, 5000);
    expect(hi.t).toBeGreaterThan(0.5);
    const fwd = hi.target as number;
    expect(tFromScroll(topAt(fwd), H, BAR, DOCK_LEAD)).toBeCloseTo(1, 6);
    expect(fwd).toBeGreaterThan(400);
  });

  it('picks the end nearer in t', () => {
    // t = 0 at scrollY 65, t = 1 at scrollY 440: the midpoint is 252.5.
    expect(snapToDockEnd(topAt(250), H, BAR, 250, 5000).target).toBeCloseTo(65);
    expect(snapToDockEnd(topAt(255), H, BAR, 255, 5000).target).toBeCloseTo(440);
  });

  it('never targets outside the scrollable range', () => {
    const r = snapToDockEnd(topAt(300), H, BAR, 300, 350);
    expect(r.target).toBeLessThanOrEqual(350);
    expect(r.target).toBeGreaterThanOrEqual(0);
  });

  it('does nothing without a usable cover', () => {
    expect(snapToDockEnd(0, 0, BAR, 100, 500).target).toBeNull();
  });
});
