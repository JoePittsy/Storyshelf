import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MiniPlayer } from './MiniPlayer';

const base = {
  title: 'Book',
  position: 600000,
  duration: 3600000,
  playing: false,
  skipBackSeconds: 30,
  onSkipBack: () => {},
  onTogglePlay: () => {},
};

describe('MiniPlayer seeking', () => {
  it('without onSeek keeps the passive progressbar', () => {
    cleanup();
    render(<MiniPlayer {...base} onOpen={() => {}} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('with onSeek shows a slider naming the chapter; seeking does not open the player', () => {
    cleanup();
    const onSeek = vi.fn();
    const onOpen = vi.fn();
    render(<MiniPlayer {...base} onSeek={onSeek} onOpen={onOpen} markers={[{ at: 0, label: 'Chapter 1: A' }]} />);
    const bar = screen.getByRole('slider');
    expect(bar).toHaveAttribute('aria-valuetext', '10:00 of 1:00:00, Chapter 1: A');
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    fireEvent.click(bar);
    expect(onSeek).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
