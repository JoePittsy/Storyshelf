import { describe, expect, it } from 'vitest';
import type { ListeningSession } from '../api/history';
import {
  FINISH_WINDOW_S,
  HANDOFF_THRESHOLD_S,
  describeFinished,
  describeHandoff,
  deviceName,
  finishedElsewhere,
  fmtGap,
  newerElsewhere,
  offerToShow,
  whoWrote,
  type Writer,
} from './handoff';

// The player last told the server 1000 s, at t = 50_000 ms, and is still there.
const ours = { position: 1000, lastSent: 1000, lastWriteAt: 50_000 };
const server = (currentTime: number, lastUpdate = 60_000, isFinished = false) => ({
  currentTime,
  lastUpdate,
  isFinished,
});

describe('newerElsewhere: is there a newer place written by someone else?', () => {
  it('yes: written after our last write, and more than the threshold from our place, ahead or behind', () => {
    expect(newerElsewhere(server(1000 + 42 * 60), ours)).toBe(true);
    expect(newerElsewhere(server(1000 - 600), ours)).toBe(true);
  });

  it('no: within the threshold of our place (a rewind or a sentence apart is the same place)', () => {
    expect(newerElsewhere(server(1000 + HANDOFF_THRESHOLD_S), ours)).toBe(false);
    expect(newerElsewhere(server(1000 - 20), ours)).toBe(false);
    expect(newerElsewhere(server(1000 + HANDOFF_THRESHOLD_S + 1), ours)).toBe(true);
  });

  it('no: written before our last write (our own failed sync left an older place, say)', () => {
    expect(newerElsewhere(server(4000, 49_000), ours)).toBe(false);
    expect(newerElsewhere(server(4000, 50_000), ours)).toBe(false);
  });

  it('no: the server still holds the place we sent, whatever its clock says (our place moved since, unsent)', () => {
    expect(newerElsewhere(server(1000, 99_000), { ...ours, position: 2000 })).toBe(false);
    expect(newerElsewhere(server(1002, 99_000), { ...ours, position: 2000 })).toBe(false);
  });

  it('no: nothing on the server, or the book is finished there', () => {
    expect(newerElsewhere(null, ours)).toBe(false);
    expect(newerElsewhere(server(4000, 60_000, true), ours)).toBe(false);
  });
});

describe('finishedElsewhere: a finish written by someone else, which a sync from here would undo', () => {
  // The book is 10_000 s long; the player last sent 1000 s at t = 50_000 ms, and is still there.
  const finished = (lastUpdate = 60_000, currentTime = 10_000) => server(currentTime, lastUpdate, true);
  const duration = 10_000;

  it('yes: finished after our last write, at a place that is not the one we sent, while we are away from the end', () => {
    expect(finishedElsewhere(finished(), ours, duration)).toBe(true);
  });

  it('no: not finished, or nothing on the server', () => {
    expect(finishedElsewhere(server(10_000, 60_000, false), ours, duration)).toBe(false);
    expect(finishedElsewhere(null, ours, duration)).toBe(false);
  });

  it('no: finished before our last write: the book was already finished when we opened it, and playing it again is chosen', () => {
    expect(finishedElsewhere(finished(49_000), ours, duration)).toBe(false);
    expect(finishedElsewhere(finished(50_000), ours, duration)).toBe(false);
  });

  it('no: the finish is the place we sent (our own finish, whatever either clock says)', () => {
    const atEnd = { position: 10_000, lastSent: 10_000, lastWriteAt: 50_000 };
    expect(finishedElsewhere(finished(99_000), atEnd, duration)).toBe(false);
    // Moved back since, to listen again: still our own record, so the next sync may move it.
    expect(finishedElsewhere(finished(99_000), { ...atEnd, position: 4000 }, duration)).toBe(false);
  });

  it('yes: marked finished elsewhere at the very place we last sent (Mark as finished keeps the place)', () => {
    expect(finishedElsewhere(finished(60_000, 1000), ours, duration)).toBe(true);
    expect(finishedElsewhere(finished(60_000, 1003), ours, duration)).toBe(true);
  });

  it('no: our own place is at the very end, where a sync keeps the book finished', () => {
    expect(finishedElsewhere(finished(), { ...ours, position: duration - FINISH_WINDOW_S }, duration)).toBe(false);
    expect(finishedElsewhere(finished(), { ...ours, position: duration - FINISH_WINDOW_S - 1 }, duration)).toBe(true);
  });
});

describe('deviceName: what to call the device that wrote it', () => {
  it('Apple devices by model, or iOS from the browser', () => {
    expect(deviceName({ manufacturer: 'Apple', model: 'iPhone', clientName: 'Abs iOS' })).toBe('iPhone');
    expect(deviceName({ model: 'iPhone15,2' })).toBe('iPhone');
    expect(deviceName({ model: 'iPad13,4' })).toBe('iPad');
    expect(
      deviceName({ osName: 'iOS', browserName: 'Mobile Safari', deviceType: 'mobile', clientName: 'Storyshelf' })
    ).toBe('iPhone');
    expect(deviceName({ osName: 'macOS', browserName: 'Safari' })).toBe('Mac');
    expect(deviceName({ osName: 'Mac OS', browserName: 'Chrome' })).toBe('Mac');
  });

  it('Android by its model when it has one; computers by their system', () => {
    expect(deviceName({ manufacturer: 'Google', model: 'Pixel 7' })).toBe('Pixel 7');
    expect(deviceName({ osName: 'Android', deviceType: 'mobile' })).toBe('Android phone');
    expect(deviceName({ osName: 'Android', deviceType: 'tablet' })).toBe('Android tablet');
    expect(deviceName({ osName: 'Windows', browserName: 'Edge' })).toBe('Windows PC');
    expect(deviceName({ osName: 'Chrome OS' })).toBe('Chromebook');
    expect(deviceName({ osName: 'Linux' })).toBe('Linux computer');
  });

  it('nothing to go on: null', () => {
    expect(deviceName(null)).toBeNull();
    expect(deviceName({})).toBeNull();
    expect(deviceName({ osName: 'Haiku' })).toBeNull();
  });
});

const session = (over: Partial<ListeningSession> & { deviceInfo?: Record<string, unknown> }): ListeningSession =>
  ({
    id: 's',
    libraryItemId: 'li_1',
    mediaType: 'book',
    displayTitle: 'T',
    displayAuthor: null,
    timeListening: 60,
    startTime: 0,
    currentTime: 0,
    startedAt: 0,
    updatedAt: 0,
    ...over,
  }) as ListeningSession;

describe('whoWrote: the session behind the newer place', () => {
  it('is the one that stopped at that place, updated nearest when the place was, within a couple of minutes', () => {
    const sessions = [
      session({ id: 'a', currentTime: 5000, updatedAt: 100_000, deviceInfo: { deviceId: 'phone', model: 'iPhone' } }),
      session({ id: 'b', currentTime: 900, updatedAt: 40_000, deviceInfo: { deviceId: 'pc', osName: 'Windows' } }),
    ];
    expect(whoWrote(sessions, { currentTime: 5000, lastUpdate: 101_000 }, 'me')).toEqual({
      name: 'iPhone',
      sameBrowser: false,
    });
    expect(whoWrote(sessions, { currentTime: 901, lastUpdate: 41_000 }, 'me')).toEqual({
      name: 'Windows PC',
      sameBrowser: false,
    });
  });

  it('nothing near enough (a write with no session, such as a seek before playing): unknown', () => {
    const sessions = [session({ currentTime: 5000, updatedAt: 100_000, deviceInfo: { model: 'iPhone' } })];
    expect(whoWrote(sessions, { currentTime: 5000, lastUpdate: 100_000 + 10 * 60_000 }, 'me')).toEqual({
      name: null,
      sameBrowser: false,
    });
    expect(whoWrote([], { currentTime: 5000, lastUpdate: 100_000 }, 'me')).toEqual({ name: null, sameBrowser: false });
  });

  it('a session that stopped somewhere else did not write it, however recent', () => {
    // The iPhone synced 5000 a moment ago; then a write with no session (a PATCH) put 1500 there.
    const sessions = [session({ currentTime: 5000, updatedAt: 100_000, deviceInfo: { model: 'iPhone' } })];
    expect(whoWrote(sessions, { currentTime: 1500, lastUpdate: 102_000 }, 'me')).toEqual({
      name: null,
      sameBrowser: false,
    });
  });

  it('this browser\'s own device id: another tab or window of this browser, not "your PC"', () => {
    const sessions = [
      session({ currentTime: 5000, updatedAt: 100_000, deviceInfo: { deviceId: 'me', osName: 'Windows' } }),
    ];
    expect(whoWrote(sessions, { currentTime: 5000, lastUpdate: 100_000 }, 'me')).toEqual({
      name: null,
      sameBrowser: true,
    });
  });
});

describe('fmtGap', () => {
  it('in whole minutes, then hours and minutes', () => {
    expect(fmtGap(31)).toBe('1 min');
    expect(fmtGap(42 * 60 + 20)).toBe('42 min');
    expect(fmtGap(60 * 60)).toBe('1 h');
    expect(fmtGap(65 * 60)).toBe('1 h 5 min');
    expect(fmtGap(12 * 3600 + 59)).toBe('12 h');
  });
});

describe('describeHandoff: the words', () => {
  const iPhone: Writer = { name: 'iPhone', sameBrowser: false };
  const unknown: Writer = { name: null, sameBrowser: false };
  const tab: Writer = { name: null, sameBrowser: true };

  it('ahead: names the device, the gap and the place', () => {
    expect(describeHandoff({ position: 11525, device: iPhone }, 11525 - 42 * 60)).toEqual({
      label: 'Your iPhone is 42 min ahead · Jump to 3:12:05',
      shortLabel: 'Jump ahead to 3:12:05',
      jumpLabel: "your iPhone's place",
      ahead: true,
    });
  });

  it('behind: says the other device went back, and where', () => {
    expect(describeHandoff({ position: 3720, device: iPhone }, 9000)).toEqual({
      label: 'Your iPhone went back to 1:02:00 · Jump there',
      shortLabel: 'Jump back to 1:02:00',
      jumpLabel: "your iPhone's place",
      ahead: false,
    });
  });

  it('another device when it is not known; another tab when it is this browser', () => {
    expect(describeHandoff({ position: 2470, device: unknown }, 100).label).toBe(
      'Another device is 39 min ahead · Jump to 41:10'
    );
    expect(describeHandoff({ position: 2470, device: unknown }, 100).jumpLabel).toBe("the other device's place");
    expect(describeHandoff({ position: 100, device: tab }, 2470).label).toBe(
      'Another tab went back to 1:40 · Jump there'
    );
    expect(describeHandoff({ position: 100, device: tab }, 2470).jumpLabel).toBe("the other tab's place");
  });
});

describe('describeFinished: the words', () => {
  it('names the device, says nothing is saved here, and offers to carry on', () => {
    expect(describeFinished({ name: 'iPhone', sameBrowser: false })).toEqual({
      toast: "Your iPhone finished this book. Your place isn't being saved here.",
      label: 'Your iPhone finished this book · Carry on from here',
      shortLabel: 'Finished elsewhere · Carry on here',
      action: 'Carry on from here',
    });
  });

  it('another tab, or a device it knows nothing about', () => {
    expect(describeFinished({ name: null, sameBrowser: true }).toast).toMatch(/^Another tab finished/);
    expect(describeFinished({ name: null, sameBrowser: false }).toast).toMatch(/^Another device finished/);
  });
});

describe('offerToShow: one offer at a time', () => {
  it('a finish written elsewhere comes first: nothing is being saved until it is answered', () => {
    expect(offerToShow({ finished: true, handoff: true, asleep: true })).toBe('finished');
    expect(offerToShow({ finished: true, handoff: false, asleep: false })).toBe('finished');
  });

  it('the hand-off wins over the sleep timer\'s "fell asleep" offer', () => {
    expect(offerToShow({ handoff: true, asleep: true })).toBe('handoff');
    expect(offerToShow({ handoff: true, asleep: false })).toBe('handoff');
    expect(offerToShow({ handoff: false, asleep: true })).toBe('asleep');
    expect(offerToShow({ handoff: false, asleep: false })).toBeNull();
  });
});
