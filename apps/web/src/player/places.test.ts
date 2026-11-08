// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { localStart, placeOf, savePlace } from './places';

beforeEach(() => localStorage.clear());

describe('the places kept on the device', () => {
  it('keeps a place with when it was left', () => {
    savePlace('li_1', 120, 5000);
    expect(placeOf('li_1')).toEqual({ position: 120, updatedAt: 5000 });
    expect(placeOf('li_2')).toBeUndefined();
  });

  it('a place that has not moved keeps the time it was left, so it never looks newer than it is', () => {
    savePlace('li_1', 120, 5000);
    savePlace('li_1', 120.4, 9000);
    expect(placeOf('li_1')).toEqual({ position: 120, updatedAt: 5000 });
    savePlace('li_1', 130, 9000);
    expect(placeOf('li_1')).toEqual({ position: 130, updatedAt: 9000 });
  });
});

describe('where a book starts on the device', () => {
  const saved = { position: 700, updatedAt: 2000 };
  const server = { currentTime: 200, lastUpdate: 1000 };

  it('takes the newer of this device’s place and the server’s last known one', () => {
    expect(localStart(undefined, null, saved, server)).toEqual({ position: 700, at: 2000 });
    expect(localStart(undefined, null, saved, { currentTime: 200, lastUpdate: 3000 })).toEqual({
      position: 200,
      at: 3000,
    });
  });

  it('a start named outright, or a move made on the restored book, wins', () => {
    expect(localStart(42, null, saved, server)).toEqual({ position: 42, at: null });
    expect(localStart(undefined, 99, saved, server)).toEqual({ position: 99, at: null });
  });

  it('takes whichever it has, and with neither, the beginning', () => {
    expect(localStart(undefined, null, undefined, server)).toEqual({ position: 200, at: 1000 });
    expect(localStart(undefined, null, saved, undefined)).toEqual({ position: 700, at: 2000 });
    expect(localStart(undefined, null, undefined, undefined)).toEqual({ position: 0, at: null });
    expect(localStart(undefined, null, undefined, { lastUpdate: 1000 })).toEqual({ position: 0, at: null });
  });
});
