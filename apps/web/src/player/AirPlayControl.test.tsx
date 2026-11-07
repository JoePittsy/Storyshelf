// @vitest-environment jsdom
// The AirPlay button on Now Playing: there only while Safari reports a target, lit while streaming, and it opens the
// picker. The player's <audio> is faked: the engine's own is never made here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';

vi.mock('./engine', () => ({ prepareAudio: vi.fn() }));

import { prepareAudio } from './engine';
import { attachAirPlay } from './airplay';
import { AirPlayControl } from './AirPlayControl';

function safariAudio() {
  const el = Object.assign(new EventTarget(), {
    webkitShowPlaybackTargetPicker: vi.fn(),
    webkitCurrentPlaybackTargetIsWireless: false,
  });
  attachAirPlay(el as unknown as HTMLMediaElement);
  return el;
}
const fire = (el: EventTarget, type: string, extra: object = {}) =>
  act(() => void el.dispatchEvent(Object.assign(new Event(type), extra)));

afterEach(() => {
  cleanup();
  attachAirPlay(null);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AirPlayControl', () => {
  it('shows nothing until a target is available, then a button that opens the picker', async () => {
    const el = safariAudio();
    render(<AirPlayControl />);
    expect(screen.queryByRole('button', { name: 'AirPlay' })).not.toBeInTheDocument();
    fire(el, 'webkitplaybacktargetavailabilitychanged', { availability: 'available' });
    await userEvent.click(screen.getByRole('button', { name: 'AirPlay' }));
    expect(el.webkitShowPlaybackTargetPicker).toHaveBeenCalledOnce();
    fire(el, 'webkitplaybacktargetavailabilitychanged', { availability: 'not-available' });
    expect(screen.queryByRole('button', { name: 'AirPlay' })).not.toBeInTheDocument();
  });

  it('is lit while playback is on an AirPlay device', () => {
    const el = safariAudio();
    render(<AirPlayControl />);
    fire(el, 'webkitplaybacktargetavailabilitychanged', { availability: 'available' });
    expect(screen.getByRole('button', { name: 'AirPlay' })).not.toHaveAttribute('data-active');
    el.webkitCurrentPlaybackTargetIsWireless = true;
    fire(el, 'webkitcurrentplaybacktargetiswirelesschanged');
    expect(screen.getByRole('button', { name: 'AirPlay' })).toHaveAttribute('data-active', 'true');
  });

  it("makes the player's audio element early only in a browser with AirPlay", () => {
    render(<AirPlayControl />);
    expect(prepareAudio).not.toHaveBeenCalled();
    cleanup();
    vi.stubGlobal('WebKitPlaybackTargetAvailabilityEvent', class {});
    render(<AirPlayControl />);
    expect(prepareAudio).toHaveBeenCalledOnce();
  });
});
