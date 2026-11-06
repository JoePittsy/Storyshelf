import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PlaybackRemaining, PlaybackTime } from './PlaybackTime';
import { SeekBar } from './SeekBar';

function setup(duration = 210000, position = 105000) {
  cleanup();
  const onSeek = vi.fn();
  render(<SeekBar position={position} duration={duration} onSeek={onSeek} />);
  return { bar: screen.getByRole('slider', { name: 'Progress' }), onSeek };
}

describe('SeekBar', () => {
  it('is a focusable slider that announces the time', () => {
    const { bar } = setup();
    expect(bar).toHaveAttribute('tabindex', '0');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuetext', '1:45 of 3:30');
  });

  it('ArrowRight and ArrowLeft move 5 seconds', () => {
    const { bar, onSeek } = setup();
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(110000);
    fireEvent.keyDown(bar, { key: 'ArrowLeft' });
    expect(onSeek).toHaveBeenLastCalledWith(100000);
  });

  it('Home seeks to 0 and End to the end', () => {
    const { bar, onSeek } = setup();
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(onSeek).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(bar, { key: 'End' });
    expect(onSeek).toHaveBeenLastCalledWith(210000);
  });

  it('clamps seeks to [0, duration]', () => {
    const start = setup(210000, 1000);
    fireEvent.keyDown(start.bar, { key: 'ArrowLeft' });
    expect(start.onSeek).toHaveBeenLastCalledWith(0);
    const end = setup(210000, 208000);
    fireEvent.keyDown(end.bar, { key: 'ArrowRight' });
    expect(end.onSeek).toHaveBeenLastCalledWith(210000);
  });

  it('seeks to the clicked fraction of the bar', () => {
    const { bar, onSeek } = setup();
    bar.getBoundingClientRect = () => ({ left: 100, width: 200 }) as DOMRect;
    fireEvent.click(bar, { clientX: 250 }); // three quarters along
    expect(onSeek).toHaveBeenLastCalledWith(157500);
  });

  it('is disabled and silent without a duration', () => {
    const { bar, onSeek } = setup(0, 0);
    expect(bar).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    fireEvent.keyDown(bar, { key: 'End' });
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe('PlaybackTime and PlaybackRemaining', () => {
  it('format milliseconds as m:ss, and the remainder with a minus', () => {
    cleanup();
    render(
      <>
        <PlaybackTime ms={89000} />
        <PlaybackRemaining position={89000} duration={222000} />
      </>
    );
    expect(screen.getByText('1:29')).toBeInTheDocument();
    expect(screen.getByText('−2:13')).toHaveAttribute('aria-hidden', 'true');
  });

  it('PlaybackRemaining renders nothing without a duration', () => {
    cleanup();
    const { container } = render(<PlaybackRemaining position={0} duration={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
