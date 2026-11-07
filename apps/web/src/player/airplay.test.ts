// AirPlay: Safari's playback target API on the player's <audio>, faked here with an EventTarget, since no browser that
// runs these tests has it (and only Safari ever will).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachAirPlay, getAirPlay, showAirPlayPicker, subscribeAirPlay } from './airplay';

type Fake = EventTarget & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};

/** A media element as Safari has it: the picker method, the wireless flag and the two events. */
function safariAudio(wireless = false): Fake {
  return Object.assign(new EventTarget(), {
    webkitShowPlaybackTargetPicker: vi.fn(),
    webkitCurrentPlaybackTargetIsWireless: wireless,
  });
}

const availability = (el: EventTarget, value: 'available' | 'not-available') =>
  el.dispatchEvent(Object.assign(new Event('webkitplaybacktargetavailabilitychanged'), { availability: value }));

const wirelessNow = (el: Fake, value: boolean) => {
  el.webkitCurrentPlaybackTargetIsWireless = value;
  el.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
};

const attach = (el: Fake) => attachAirPlay(el as unknown as HTMLMediaElement);

afterEach(() => attachAirPlay(null));

describe('AirPlay availability', () => {
  it('is off until Safari says a target is available, and follows it after that', () => {
    const el = safariAudio();
    attach(el);
    expect(getAirPlay()).toEqual({ available: false, wireless: false });
    availability(el, 'available');
    expect(getAirPlay()).toEqual({ available: true, wireless: false });
    availability(el, 'not-available');
    expect(getAirPlay().available).toBe(false);
  });

  it('tells subscribers when it changes, and stops once they unsubscribe', () => {
    const el = safariAudio();
    attach(el);
    const cb = vi.fn();
    const off = subscribeAirPlay(cb);
    availability(el, 'available');
    expect(cb).toHaveBeenCalledTimes(1);
    availability(el, 'available'); // no change, no call
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    availability(el, 'not-available');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('never turns on in a browser without the API (Chrome, Firefox)', () => {
    const el = new EventTarget() as Fake;
    attach(el);
    availability(el, 'available');
    expect(getAirPlay()).toEqual({ available: false, wireless: false });
    expect(showAirPlayPicker()).toBe(false);
  });

  it('lets go of an element when another is attached', () => {
    const old = safariAudio();
    attach(old);
    const el = safariAudio();
    attach(el);
    availability(old, 'available');
    expect(getAirPlay().available).toBe(false);
    availability(el, 'available');
    expect(getAirPlay().available).toBe(true);
  });
});

describe('AirPlay streaming', () => {
  it('follows whether playback is going to a wireless target', () => {
    const el = safariAudio();
    attach(el);
    availability(el, 'available');
    wirelessNow(el, true);
    expect(getAirPlay()).toEqual({ available: true, wireless: true });
    wirelessNow(el, false);
    expect(getAirPlay().wireless).toBe(false);
  });

  it('reads the wireless state the element already has when it is attached', () => {
    attach(safariAudio(true));
    expect(getAirPlay().wireless).toBe(true);
  });

  it('counts as available while streaming, even if availability says otherwise', () => {
    // The button has to stay to let the listener pick the iPhone again.
    const el = safariAudio();
    attach(el);
    wirelessNow(el, true);
    availability(el, 'not-available');
    expect(getAirPlay()).toEqual({ available: true, wireless: true });
  });
});

describe('the picker', () => {
  it("opens Safari's picker on the attached element", () => {
    const el = safariAudio();
    attach(el);
    expect(showAirPlayPicker()).toBe(true);
    expect(el.webkitShowPlaybackTargetPicker).toHaveBeenCalledOnce();
  });

  it('does nothing before there is an element', () => {
    expect(showAirPlayPicker()).toBe(false);
  });
});
