// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';

const iPhone = { name: 'iPhone', sameBrowser: false };
type Player = {
  item: { id: string } | null;
  position: number;
  status: string;
  handoff: { itemId: string; position: number; lastUpdate: number; device: typeof iPhone } | null;
};
let player: Player;
vi.mock('./engine', () => ({ usePlayer: () => player }));
const jumpTo = vi.fn();
vi.mock('./useUndoableJump', () => ({ usePlayerJump: () => ({ jumpTo }) }));

import { forgetFellAsleep, rememberFellAsleep } from './fellAsleep';
import { PlayerOffer } from './PlayerOffer';

beforeEach(() => {
  localStorage.clear();
  forgetFellAsleep();
  player = {
    item: { id: 'b1' },
    position: 9005,
    status: 'paused',
    handoff: { itemId: 'b1', position: 11525, lastUpdate: 1, device: iPhone },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PlayerOffer', () => {
  it("offers another device's newer place, and jumps there through the undoable jump", async () => {
    render(<PlayerOffer variant="inline" />);
    await userEvent.click(screen.getByRole('button', { name: /^Your iPhone is 42 min ahead · Jump to 3:12:05/ }));
    expect(jumpTo).toHaveBeenCalledWith(11525, "your iPhone's place");
  });

  it('says so when the other device went back', () => {
    player = { ...player, position: 9000, handoff: { ...player.handoff!, position: 3720 } };
    render(<PlayerOffer variant="bar" />);
    expect(screen.getByRole('button', { name: /^Your iPhone went back to 1:02:00 · Jump there/ })).toBeInTheDocument();
  });

  it('shows the hand-off rather than the "fell asleep" offer when both apply, and that one when it is alone', () => {
    rememberFellAsleep({ itemId: 'b1', target: 2470, chapter: null, stoppedAt: 9005 });
    const { rerender } = render(<PlayerOffer variant="inline" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Your iPhone/ })).toBeInTheDocument();
    player = { ...player, handoff: null };
    rerender(<PlayerOffer variant="inline" />);
    expect(screen.getByRole('button', { name: /^Go back to where the timer began/ })).toBeInTheDocument();
  });

  it('shows nothing while playing or loading, or for another book', () => {
    const { rerender } = render(<PlayerOffer variant="inline" />);
    player = { ...player, status: 'playing' };
    rerender(<PlayerOffer variant="inline" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    player = { ...player, status: 'paused', handoff: { ...player.handoff!, itemId: 'b2' } };
    rerender(<PlayerOffer variant="inline" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
