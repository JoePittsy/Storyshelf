// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const item = { id: 'b1', title: 'Peter Rabbit', author: 'Beatrix Potter', coverUrl: '' };
let player: Record<string, unknown>;
vi.mock('./engine', () => ({ usePlayer: () => player }));

import { PlayerAnnouncer } from './PlayerAnnouncer';

const idle = () => ({ status: 'paused', item, rate: 1, sleep: null, position: 100, ended: false });

function renderAnnouncer() {
  const view = render(<PlayerAnnouncer />);
  const change = (over: Record<string, unknown>) => {
    player = { ...player, ...over };
    act(() => view.rerender(<PlayerAnnouncer />));
  };
  return change;
}
const said = () => screen.getByRole('status').textContent?.replaceAll(String.fromCharCode(0x200b), '');

beforeEach(() => {
  player = idle();
});
afterEach(cleanup);

describe('PlayerAnnouncer', () => {
  it('is a standing, empty polite status line, saying nothing on first mount', () => {
    renderAnnouncer();
    const line = screen.getByRole('status');
    expect(line).toHaveAttribute('aria-live', 'polite');
    expect(line).toBeEmptyDOMElement();
  });

  it('says the book when it starts and a short word when it carries on', () => {
    const change = renderAnnouncer();
    change({ status: 'loading' });
    expect(said()).toBe('');
    change({ status: 'playing' });
    expect(said()).toBe('Playing Peter Rabbit');
    change({ status: 'paused' });
    expect(said()).toBe('Paused');
    change({ status: 'loading' });
    change({ status: 'playing' });
    expect(said()).toBe('Playing');
  });

  it('changes the text node when the same words come twice in a row, so they are read again', () => {
    const change = renderAnnouncer();
    const fifteen = (remainingMs: number) => ({ kind: 'minutes', remainingMs, minutes: 15 });
    change({ sleep: fifteen(900_000) });
    const first = screen.getByRole('status').textContent;
    change({ sleep: fifteen(300_000) }); // counting down: nothing said
    change({ sleep: fifteen(900_000) }); // chosen again: started over
    const second = screen.getByRole('status').textContent;
    expect(said()).toBe('Sleep timer: 15 minutes');
    expect(second).not.toBe(first);
  });

  it('says the speed and the sleep timer, but not its countdown', () => {
    const change = renderAnnouncer();
    change({ rate: 1.25 });
    expect(said()).toBe('Speed 1.25×');
    change({ sleep: { kind: 'minutes', remainingMs: 900_000, minutes: 15 } });
    expect(said()).toBe('Sleep timer: 15 minutes');
    const before = screen.getByRole('status').textContent;
    change({ sleep: { kind: 'minutes', remainingMs: 899_000, minutes: 15 } });
    expect(screen.getByRole('status').textContent).toBe(before);
    change({ sleep: null });
    expect(said()).toBe('Sleep timer off');
  });
});
