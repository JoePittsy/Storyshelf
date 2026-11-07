// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';

let player = { item: { id: 'b1' }, position: 4000, status: 'paused' };
vi.mock('./engine', () => ({ usePlayer: () => player }));
const jumpTo = vi.fn();
vi.mock('./useUndoableJump', () => ({ usePlayerJump: () => ({ jumpTo }) }));

import { forgetFellAsleep, rememberFellAsleep } from './fellAsleep';
import { FellAsleepOffer } from './FellAsleepOffer';

beforeEach(() => {
  localStorage.clear();
  forgetFellAsleep();
  player = { item: { id: 'b1' }, position: 4000, status: 'paused' };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FellAsleepOffer', () => {
  it('offers to go back to where the timer began, and goes there through the undoable jump, once', async () => {
    rememberFellAsleep({ itemId: 'b1', target: 2470, chapter: null, stoppedAt: 4000 });
    render(<FellAsleepOffer variant="inline" />);
    await userEvent.click(screen.getByRole('button', { name: /^Go back to where the timer began, 41:10/ }));
    expect(jumpTo).toHaveBeenCalledWith(2470, 'where the timer began');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names the chapter when it offers the start of the chapter the timer stopped in', async () => {
    rememberFellAsleep({ itemId: 'b1', target: 3725, chapter: 11, stoppedAt: 4000 });
    render(<FellAsleepOffer variant="bar" />);
    await userEvent.click(screen.getByRole('button', { name: /^Go back to the start of Chapter 12, 1:02:05/ }));
    expect(jumpTo).toHaveBeenCalledWith(3725, 'Chapter 12');
  });

  it('shows nothing with no offer, for another book, or while playing', () => {
    const { rerender } = render(<FellAsleepOffer variant="inline" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rememberFellAsleep({ itemId: 'b2', target: 100, chapter: null, stoppedAt: 4000 });
    rerender(<FellAsleepOffer variant="inline" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rememberFellAsleep({ itemId: 'b1', target: 100, chapter: null, stoppedAt: 4000 });
    player = { ...player, status: 'playing' };
    rerender(<FellAsleepOffer variant="inline" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
