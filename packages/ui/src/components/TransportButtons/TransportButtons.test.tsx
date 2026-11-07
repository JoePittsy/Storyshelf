import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransportButtons } from './TransportButtons';

const noop = () => {};

describe('TransportButtons', () => {
  it('calls the matching handler for each button', () => {
    const h = { onPlayPause: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
    render(<TransportButtons playing={false} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(h.onPrevious).toHaveBeenCalledTimes(1);
    expect(h.onPlayPause).toHaveBeenCalledTimes(1);
    expect(h.onNext).toHaveBeenCalledTimes(1);
  });

  it('names the middle button by what it will do', () => {
    const { rerender } = render(<TransportButtons playing onPlayPause={noop} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    rerender(<TransportButtons playing={false} onPlayPause={noop} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('disables a button with no handler, or the one asked, or all of them', () => {
    const { rerender } = render(<TransportButtons playing={false} onPlayPause={noop} onPrevious={noop} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    rerender(<TransportButtons playing={false} onPlayPause={noop} onPrevious={noop} previousDisabled />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    rerender(<TransportButtons playing={false} onPlayPause={noop} onPrevious={noop} onNext={noop} disabled />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });

  it('renames the outer buttons and places extra controls around Play', () => {
    render(
      <TransportButtons
        playing={false}
        onPlayPause={noop}
        onPrevious={noop}
        onNext={noop}
        previousLabel="Previous chapter"
        nextLabel="Next chapter"
        beforePlay={<button>Back</button>}
        afterPlay={<button>Forward</button>}
      />
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual([
      'Previous chapter',
      'Back',
      'Play',
      'Forward',
      'Next chapter',
    ]);
  });
});

describe('TransportButtons without the outer buttons', () => {
  it('leaves out Previous and Next when ends is false, keeping the skips and Play', () => {
    render(
      <TransportButtons
        playing={false}
        onPlayPause={noop}
        ends={false}
        beforePlay={<button>Back 30</button>}
        afterPlay={<button>Forward 30</button>}
      />
    );
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual([
      'Back 30',
      'Play',
      'Forward 30',
    ]);
  });
});
