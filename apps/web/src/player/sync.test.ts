/**
 * Tests for the progress-sync clock (when to send progress, and what).
 * Code under test: apps/web/src/player/sync.ts
 *
 * Requirements covered (IDs appear in the test names):
 *  REQ-22 Progress is saved while playing, on pause, and when the app is hidden
 *         or closed. (Pause, kill the app -> the server holds the paused position.)
 *  REQ-23 Another device resumes from the latest position (REQ-22 supplies it).
 *
 * Design facts (ABS v2.37.2): the sync body is `{currentTime, timeListened, duration}`;
 * `currentTime` is book time, `timeListened` is real seconds actually listened since
 * the last sync. The clock holds `listened` and `lastSynced` (book time last sent).
 */
import { describe, expect, it } from 'vitest';
import { SYNC_INTERVAL_S, dueOnStop, dueWhilePlaying, markSynced, payload, startClock, tick } from './sync';

describe('REQ-22: SYNC_INTERVAL_S', () => {
  it('REQ-22: progress is saved every 10 s of listening', () => {
    expect(SYNC_INTERVAL_S, 'Expected a 10 s sync interval').toBe(10);
  });
});

describe('REQ-22: startClock', () => {
  it('REQ-22: starts with nothing listened and the starting position as last synced', () => {
    expect(startClock(3730), 'Expected {listened: 0, lastSynced: 3730}').toEqual({ listened: 0, lastSynced: 3730 });
  });
});

describe('REQ-22: tick adds real playing seconds', () => {
  it('REQ-22: adds the seconds to listened and keeps lastSynced', () => {
    expect(tick(startClock(100), 4), 'Expected listened 4 with lastSynced unchanged').toEqual({
      listened: 4,
      lastSynced: 100,
    });
  });

  it('REQ-22: successive ticks accumulate', () => {
    const c = tick(tick(startClock(100), 4), 3.5);
    expect(c.listened, 'Expected 4 + 3.5 = 7.5 s listened').toBe(7.5);
    expect(c.lastSynced, 'Expected lastSynced to stay at 100 until a sync is marked').toBe(100);
  });
});

describe('REQ-22: dueWhilePlaying (sync while playing)', () => {
  it('REQ-22: not due with nothing listened', () => {
    expect(dueWhilePlaying(startClock(0)), 'Expected no sync before anything is listened').toBe(false);
  });

  it('REQ-22: not due just under 10 s', () => {
    expect(dueWhilePlaying({ listened: 9.99, lastSynced: 0 }), 'Expected no sync at 9.99 s listened').toBe(false);
  });

  it('REQ-22: due at exactly 10 s', () => {
    expect(dueWhilePlaying({ listened: 10, lastSynced: 0 }), 'Expected a sync at listened == 10').toBe(true);
  });

  it('REQ-22: due when well over 10 s (for example a throttled background tab)', () => {
    expect(dueWhilePlaying({ listened: 42, lastSynced: 0 }), 'Expected a sync at 42 s listened').toBe(true);
  });

  it('REQ-22: becomes due once ticks add up to 10 s', () => {
    const c = tick(tick(startClock(0), 6), 4);
    expect(dueWhilePlaying(c), 'Expected 6 s + 4 s of ticks to make a sync due').toBe(true);
  });
});

describe('REQ-22: dueOnStop (pause, seek while paused, hide or close)', () => {
  const clock = { listened: 0, lastSynced: 100 };

  it('REQ-22: nothing listened and the position unmoved needs no sync', () => {
    expect(dueOnStop(clock, 100), 'Expected no sync when nothing changed').toBe(false);
  });

  it('REQ-22: nothing listened and a move under 1 s needs no sync', () => {
    expect(dueOnStop(clock, 100.5), 'Expected no sync for a 0.5 s forward drift').toBe(false);
    expect(dueOnStop(clock, 99.5), 'Expected no sync for a 0.5 s backward drift').toBe(false);
  });

  it('REQ-22: pausing after listening any amount syncs, even if the position is where it was last synced', () => {
    expect(dueOnStop({ listened: 0.5, lastSynced: 100 }, 100), 'Expected a sync when 0.5 s was listened').toBe(true);
  });

  it('REQ-22: pausing after 3 s of listening syncs', () => {
    expect(dueOnStop({ listened: 3, lastSynced: 100 }, 103), 'Expected a sync on pause after listening').toBe(true);
  });

  it('REQ-22: seeking forward 1 s or more while paused syncs', () => {
    expect(dueOnStop(clock, 101), 'Expected a sync after a 1 s forward seek').toBe(true);
    expect(dueOnStop(clock, 400), 'Expected a sync after a big forward seek').toBe(true);
  });

  it('REQ-22: seeking backward 1 s or more while paused syncs', () => {
    expect(dueOnStop(clock, 99), 'Expected a sync after a 1 s backward seek').toBe(true);
    expect(dueOnStop(clock, 0), 'Expected a sync after seeking back to the start').toBe(true);
  });
});

describe('REQ-22: payload builds the sync body', () => {
  it('REQ-22: carries the current time, the listened seconds and the duration, and nothing else', () => {
    expect(payload({ listened: 12, lastSynced: 100 }, 112, 3600), 'Expected the three ABS sync fields').toEqual({
      currentTime: 112,
      timeListened: 12,
      duration: 3600,
    });
  });

  it('REQ-22: sends timeListened as-is without rounding', () => {
    expect(payload({ listened: 7.4, lastSynced: 0 }, 7.4, 100).timeListened, 'Expected 7.4, not rounded').toBe(7.4);
  });

  it('REQ-22: a seek while paused sends the new position with 0 listened', () => {
    expect(payload(startClock(100), 400, 3600), 'Expected the new position and no listening time').toEqual({
      currentTime: 400,
      timeListened: 0,
      duration: 3600,
    });
  });
});

describe('REQ-22: markSynced resets the clock', () => {
  it('REQ-22: clears listened and records the position that was sent', () => {
    expect(markSynced(250), 'Expected {listened: 0, lastSynced: 250}').toEqual({ listened: 0, lastSynced: 250 });
  });

  it('REQ-22: after a sync, nothing is due while playing or on stop at the same position', () => {
    const c = markSynced(250);
    expect(dueWhilePlaying(c), 'Expected no sync due straight after syncing').toBe(false);
    expect(dueOnStop(c, 250), 'Expected no stop-sync at the synced position').toBe(false);
  });

  it('REQ-22: a full cycle: listen 10 s, sync, listen 4 s more, pause sends only the new 4 s', () => {
    let c = tick(startClock(0), 10);
    expect(dueWhilePlaying(c), 'Expected a sync due after 10 s').toBe(true);
    c = markSynced(10);
    c = tick(c, 4);
    expect(dueWhilePlaying(c), 'Expected no sync due after only 4 s more').toBe(false);
    expect(dueOnStop(c, 14), 'Expected a pause-sync because 4 s were listened').toBe(true);
    expect(payload(c, 14, 3600), 'Expected only the 4 s since the last sync').toEqual({
      currentTime: 14,
      timeListened: 4,
      duration: 3600,
    });
  });
});
