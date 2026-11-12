import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CarPlayer } from './CarPlayer';

afterEach(cleanup);

const props = {
  chapter: 'Chapter 7',
  timeLeft: '12:34',
  timeLeftOf: 'chapter' as const,
  progress: 0.4,
  playing: true,
  skipBackSeconds: 15,
  skipForwardSeconds: 30,
  onPlayPause: vi.fn(),
  onSkipBack: vi.fn(),
  onSkipForward: vi.fn(),
  onClose: vi.fn(),
};

// Skip back, Play, skip forward and Close.
const BUTTONS = 4;

describe('CarPlayer sleep status', () => {
  it('shows nothing about sleep without a timer', () => {
    const { container } = render(<CarPlayer {...props} />);
    expect(screen.queryByText(/Stops in/)).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(BUTTONS);
  });

  it('shows the line as plain text while a timer runs: no new control, no live region', () => {
    const { container } = render(<CarPlayer {...props} sleepStatus="Stops in 14:58" />);
    const line = screen.getByText('Stops in 14:58');
    expect(line.tagName).toBe('P');
    expect(line.closest('[aria-live], [role="status"], [role="alert"], [role="timer"]')).toBeNull();
    expect(line.querySelector('button, a, [tabindex]')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(BUTTONS);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});
