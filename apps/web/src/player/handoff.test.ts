import { describe, expect, it } from 'vitest';
import type { ListeningSession } from '../api/history';
import {
  HANDOFF_THRESHOLD_S,
  describeHandoff,
  deviceName,
  fmtGap,
  newerElsewhere,
  offerToShow,
  whoWrote,
  type Writer,
} from './handoff';

// The player last told the server 1000 s, at t = 50_000 ms, and is still there.
const ours = { position: 1000, lastSent: 1000, lastWriteAt: 50_000 };
const server = (currentTime: number, lastUpdate = 60_000, isFinished = false) => ({ currentTime, lastUpdate, isFinished });

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

describe('deviceName: what to call the device that wrote it', () => {
  it('Apple devices by model, or iOS from the browser', () => {
    expect(deviceName({ manufacturer: 'Apple', model: 'iPhone', clientName: 'Abs iOS' })).toBe('iPhone');
    expect(deviceName({ model: 'iPhone15,2' })).toBe('iPhone');
    expect(deviceName({ model: 'iPad13,4' })).toBe('iPad');
    expect(deviceName({ osName: 'iOS', browserName: 'Mobile Safari', deviceType: 'mobile', clientName: 'Storyshelf' })).toBe('iPhone');
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
  it('is the one last updated nearest the place\'s update, within a couple of minutes', () => {
    const sessions = [
      session({ id: 'a', updatedAt: 100_000, deviceInfo: { deviceId: 'phone', model: 'iPhone' } }),
      session({ id: 'b', updatedAt: 40_000, deviceInfo: { deviceId: 'pc', osName: 'Windows' } }),
    ];
    expect(whoWrote(sessions, 101_000, 'me')).toEqual({ name: 'iPhone', sameBrowser: false });
    expect(whoWrote(sessions, 41_000, 'me')).toEqual({ name: 'Windows PC', sameBrowser: false });
  });

  it('nothing near enough (a write with no session, such as a seek before playing): unknown', () => {
    const sessions = [session({ updatedAt: 100_000, deviceInfo: { model: 'iPhone' } })];
    expect(whoWrote(sessions, 100_000 + 10 * 60_000, 'me')).toEqual({ name: null, sameBrowser: false });
    expect(whoWrote([], 100_000, 'me')).toEqual({ name: null, sameBrowser: false });
  });

  it('this browser\'s own device id: another tab or window of this browser, not "your PC"', () => {
    const sessions = [session({ updatedAt: 100_000, deviceInfo: { deviceId: 'me', osName: 'Windows' } })];
    expect(whoWrote(sessions, 100_000, 'me')).toEqual({ name: null, sameBrowser: true });
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
    expect(describeHandoff({ position: 2470, device: unknown }, 100).label).toBe('Another device is 39 min ahead · Jump to 41:10');
    expect(describeHandoff({ position: 2470, device: unknown }, 100).jumpLabel).toBe("the other device's place");
    expect(describeHandoff({ position: 100, device: tab }, 2470).label).toBe('Another tab went back to 1:40 · Jump there');
    expect(describeHandoff({ position: 100, device: tab }, 2470).jumpLabel).toBe("the other tab's place");
  });
});

describe('offerToShow: one offer at a time', () => {
  it('the hand-off wins over the sleep timer\'s "fell asleep" offer', () => {
    expect(offerToShow({ handoff: true, asleep: true })).toBe('handoff');
    expect(offerToShow({ handoff: true, asleep: false })).toBe('handoff');
    expect(offerToShow({ handoff: false, asleep: true })).toBe('asleep');
    expect(offerToShow({ handoff: false, asleep: false })).toBeNull();
  });
});
