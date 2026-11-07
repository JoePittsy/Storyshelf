// AirPlay, through Safari's playback target API on the player's <audio> element. The engine attaches its element here
// when it makes it; nothing else about the engine is involved. Browsers without the API (Chrome, Firefox) never report
// a target, so the button never shows there.
import { useSyncExternalStore } from 'react';

export interface AirPlayState {
  /** A target is there to pick (or playback is already on one). */
  available: boolean;
  /** Playback is going to an AirPlay target now. */
  wireless: boolean;
}

/** The WebKit-only parts of a media element. */
type WebKitMedia = HTMLMediaElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};

const AVAILABILITY = 'webkitplaybacktargetavailabilitychanged';
const WIRELESS = 'webkitcurrentplaybacktargetiswirelesschanged';
const OFF: AirPlayState = { available: false, wireless: false };

let el: WebKitMedia | null = null;
let detach = (): void => undefined;
let targets = false; // what the availability event last said
let state: AirPlayState = OFF;
const listeners = new Set<() => void>();

function update(): void {
  const wireless = !!el?.webkitCurrentPlaybackTargetIsWireless;
  const next = { available: targets || wireless, wireless };
  if (next.available === state.available && next.wireless === state.wireless) return;
  state = next;
  listeners.forEach((cb) => cb());
}

/** Watches `media` for AirPlay targets, in place of any element watched before. Null lets go. */
export function attachAirPlay(media: HTMLMediaElement | null): void {
  detach();
  detach = () => undefined;
  el = media as WebKitMedia | null;
  targets = false;
  if (el && typeof el.webkitShowPlaybackTargetPicker === 'function') {
    const target = el;
    // Safari starts looking for targets once something listens for this, and fires it with what it finds.
    const onAvailability = (e: Event) => {
      targets = (e as Event & { availability?: string }).availability === 'available';
      update();
    };
    target.addEventListener(AVAILABILITY, onAvailability);
    target.addEventListener(WIRELESS, update);
    detach = () => {
      target.removeEventListener(AVAILABILITY, onAvailability);
      target.removeEventListener(WIRELESS, update);
    };
  } else el = null;
  update();
}

export const getAirPlay = (): AirPlayState => state;

export function subscribeAirPlay(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Opens Safari's AirPlay picker for the player. False when there is nothing to open it on. */
export function showAirPlayPicker(): boolean {
  if (!el?.webkitShowPlaybackTargetPicker) return false;
  el.webkitShowPlaybackTargetPicker();
  return true;
}

/** True in a browser that has the API at all (Safari), before any element is attached. */
export const airPlayPossible = (): boolean =>
  typeof window !== 'undefined' && 'WebKitPlaybackTargetAvailabilityEvent' in window;

export const useAirPlay = (): AirPlayState => useSyncExternalStore(subscribeAirPlay, getAirPlay);
