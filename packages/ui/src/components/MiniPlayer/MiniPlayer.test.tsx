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

describe('MiniPlayer names and readout', () => {
  it('names the open button with a separator between the verb and the title', () => {
    cleanup();
    render(<MiniPlayer {...base} title="The Velveteen Rabbit" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open player: The Velveteen Rabbit' })).toBeInTheDocument();
  });

  it('reads the scrubber clock, not the time left in words as well, and no minus sign', () => {
    cleanup();
    const { container } = render(<MiniPlayer {...base} onOpen={() => {}} />);
    expect(container.textContent).toMatch(/\d+:\d\d \/ \d+:\d\d/);
    expect(container.textContent).not.toContain(' left');
    expect(container.textContent).not.toContain('−');
  });

  it('keeps the time left whole after the subtitle, which is the part that truncates', () => {
    cleanup();
    const { container } = render(<MiniPlayer {...base} subtitle="Part I" remaining="12m left" onOpen={() => {}} />);
    const left = screen.getByText('12m left');
    // Its own element on the chapter's line, so CSS can keep it whole while the chapter gives way.
    expect(left.parentElement).toHaveTextContent('Part I');
    expect(left).not.toHaveTextContent('Part I');
    expect(container.textContent).toContain('Part I');
  });
});

describe('MiniPlayer play glyph', () => {
  it('is filled, like every other play glyph', () => {
    cleanup();
    render(<MiniPlayer {...base} onOpen={() => {}} />);
    const svg = screen.getByRole('button', { name: 'Play' }).querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });
});
