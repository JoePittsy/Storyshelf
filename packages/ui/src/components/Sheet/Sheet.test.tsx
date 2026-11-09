import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

describe('Sheet', () => {
  it('has a primary Done at the bottom by default', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Chapters" doneLabel="Done">
        Rows
      </Sheet>
    );
    expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('primary');
  });
  it('can make Done a ghost pill, for a sheet whose body holds its own primary action', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Bookmarks" doneLabel="Done" doneVariant="ghost">
        Rows
      </Sheet>
    );
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toHaveClass('ghost');
    expect(done).not.toHaveClass('primary');
    await userEvent.click(done);
    expect(onClose).toHaveBeenCalled();
  });

  describe('as a bottom sheet', () => {
    // A phone-width window: the bottom-sheet query matches, reduced motion doesn't.
    const phone = () =>
      vi.stubGlobal('matchMedia', (q: string) => ({
        matches: q.includes('max-width'),
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });
    const pull = (el: Element, to: number) => {
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 100 + to / 2 });
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 100 + to });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 100 + to });
    };

    it('pulls down to close, from a row in the body', () => {
      phone();
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Sheet open onClose={onClose} title="History">
          <button type="button">A row</button>
        </Sheet>
      );
      pull(screen.getByRole('button', { name: 'A row' }), 300);
      expect(screen.getByRole('dialog')).toHaveStyle({ transform: 'translateY(100%)' });
      vi.advanceTimersByTime(400);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('leaves a pull to the body while it is scrolled down, and to a slider', () => {
      phone();
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Sheet open onClose={onClose} title="History">
          <p>Rows</p>
          <div role="slider" aria-label="Speed" aria-valuenow={1} tabIndex={0} />
        </Sheet>
      );
      pull(screen.getByRole('slider'), 300);
      const body = screen.getByText('Rows').parentElement as HTMLElement;
      body.scrollTop = 200;
      pull(screen.getByText('Rows'), 300);
      vi.advanceTimersByTime(400);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog').style.transform).toBe('');
    });

    it("doesn't drag as a centred panel on a wide window", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Sheet open onClose={onClose} title="History">
          <p>Rows</p>
        </Sheet>
      );
      pull(screen.getByText('Rows'), 300);
      vi.advanceTimersByTime(400);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
