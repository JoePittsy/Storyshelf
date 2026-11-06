import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
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
  it('format milliseconds as m:ss, and the remainder as time left in words', () => {
    cleanup();
    render(
      <>
        <PlaybackTime ms={89000} />
        <PlaybackRemaining position={89000} duration={222000} />
      </>
    );
    expect(screen.getByText('1:29')).toBeInTheDocument();
    expect(screen.getByText('2m left')).toHaveAttribute('aria-hidden', 'true');
  });

  it('PlaybackRemaining renders nothing without a duration', () => {
    cleanup();
    const { container } = render(<PlaybackRemaining position={0} duration={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SeekBar markers', () => {
  const markers = [
    { at: 0, label: 'Chapter 1: Start' },
    { at: 100000, label: 'Chapter 2: Middle' },
  ];

  it('speaks the marker at the playhead', () => {
    cleanup();
    render(<SeekBar position={105000} duration={210000} onSeek={vi.fn()} markers={markers} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '1:45 of 3:30, Chapter 2: Middle');
  });

  const measured = (width: number) =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
        observe() {
          this.cb([{ contentRect: { width } }]);
        }
        disconnect() {}
      },
    );

  it('draws a hidden tick per marker (none at 0) when there is room, and none when crowded', () => {
    cleanup();
    measured(200);
    const room = render(<SeekBar position={0} duration={200000} onSeek={vi.fn()} markers={markers} />);
    expect(room.container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1);
    cleanup();
    measured(5);
    const crowded = render(<SeekBar position={0} duration={200000} onSeek={vi.fn()} markers={markers} />);
    expect(crowded.container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('shows a hidden preview on hover', () => {
    cleanup();
    render(<SeekBar position={0} duration={200000} onSeek={vi.fn()} markers={markers} />);
    const bar = screen.getByRole('slider');
    bar.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
    fireEvent.pointerMove(bar, { clientX: 150, pointerType: 'mouse' });
    expect(screen.getByText('2:30 · Chapter 2: Middle')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.pointerLeave(bar);
    expect(screen.queryByText(/Chapter 2: Middle/)).toBeNull();
  });
});

describe('SeekBar chapter highlight', () => {
  const markers = [
    { at: 0, label: 'One' },
    { at: 100000, label: 'Two' },
  ];
  const view = (props: object) => {
    cleanup();
    const { container } = render(<SeekBar position={0} duration={200000} onSeek={vi.fn()} {...props} />);
    return container.querySelector<HTMLElement>('[class*="segment"]');
  };

  it('lifts the hovered chapter, marker to next marker, and only when it should', () => {
    const s = view({ markers, previewAt: 150000 })!;
    expect(s).toHaveAttribute('aria-hidden', 'true');
    expect(s.style.left).toBe('50%');
    expect(s.style.width).toBe('50%');
    expect(view({ markers })).toBeNull();
    expect(view({ markers: [markers[0]], previewAt: 50000 })).toBeNull();
    expect(view({ markers, previewAt: 50000, readOnly: true })).toBeNull();
  });
});

describe('SeekBar on touch and narrow screens, with onTap', () => {
  const touch = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  afterEach(() => vi.unstubAllGlobals());
  const bar = (onTap: () => void, onSeek = vi.fn()) => {
    cleanup();
    render(<SeekBar position={105000} duration={210000} onSeek={onSeek} onTap={onTap} flash={undefined} />);
    return { el: screen.getByRole('slider', { name: 'Progress' }), onSeek };
  };

  it('a tap without movement calls onTap and does not seek', () => {
    touch(true);
    const onTap = vi.fn();
    const { el, onSeek } = bar(onTap);
    fireEvent.pointerDown(el, { clientX: 50, clientY: 5 });
    fireEvent.pointerUp(el, { clientX: 52, clientY: 5 });
    fireEvent.click(el, { clientX: 52 });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('a drag past the slop seeks on release and is not a tap', () => {
    touch(true);
    const onTap = vi.fn();
    const { el, onSeek } = bar(onTap);
    fireEvent.pointerDown(el, { clientX: 50, clientY: 5 });
    fireEvent.pointerMove(el, { clientX: 70, clientY: 5 });
    fireEvent.pointerUp(el, { clientX: 70, clientY: 5 });
    expect(onTap).not.toHaveBeenCalled();
    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  it('a fine pointer on a wide screen still seeks on click and never calls onTap', () => {
    touch(false);
    const onTap = vi.fn();
    const { el, onSeek } = bar(onTap);
    fireEvent.click(el, { clientX: 10 });
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('a read-only bar can still be tapped', () => {
    touch(true);
    cleanup();
    const onTap = vi.fn();
    render(<SeekBar position={1} duration={10} onSeek={() => {}} readOnly onTap={onTap} />);
    const el = screen.getByRole('progressbar');
    fireEvent.pointerDown(el, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(el, { clientX: 5, clientY: 5 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('flashes the line for a second when it changes', () => {
    vi.useFakeTimers();
    cleanup();
    const { rerender } = render(<SeekBar position={1} duration={10} onSeek={() => {}} flash={undefined} />);
    expect(screen.queryByText('This chapter')).toBeNull();
    rerender(<SeekBar position={1} duration={10} onSeek={() => {}} flash="This chapter" />);
    expect(screen.getByText('This chapter')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByText('This chapter')).toBeNull();
    vi.useRealTimers();
  });
});
