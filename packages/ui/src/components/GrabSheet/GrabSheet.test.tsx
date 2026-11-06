import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GrabSheet } from './GrabSheet';

function setup() {
  const onDismiss = vi.fn();
  const view = render(
    <GrabSheet onDismiss={onDismiss} closeLabel="Close player">
      <p>Cover</p>
      <div role="slider" aria-label="Progress" aria-valuenow={0} tabIndex={0}>
        bar
      </div>
    </GrabSheet>,
  );
  const sheet = view.container.firstElementChild as HTMLElement;
  return { onDismiss, sheet };
}
const drag = (el: Element, dy: number, ms = 400) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100, timeStamp: 0 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 100 + dy / 2 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100, clientY: 100 + dy });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 100 + dy });
  return ms;
};

describe('GrabSheet', () => {
  it('has a chevron button named by closeLabel that dismisses', () => {
    const { onDismiss } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('follows the finger with transform while dragging down, then dismisses past the threshold', () => {
    vi.useFakeTimers();
    const { onDismiss, sheet } = setup();
    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 100, clientY: 150 });
    expect(sheet.style.transform).toBe('translateY(50px)');
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 100, clientY: 300 });
    expect(sheet.style.transform).toBe('translateY(100%)');
    vi.advanceTimersByTime(400);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('springs back when let go early and slowly', () => {
    vi.useFakeTimers();
    const { onDismiss, sheet } = setup();
    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 100, clientY: 130 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 100, clientY: 130 });
    expect(sheet.style.transform).toBe('translateY(0)');
    vi.advanceTimersByTime(400);
    expect(sheet.style.transform).toBe('');
    expect(onDismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('leaves a swipe that starts on the slider to the slider', () => {
    const { onDismiss } = setup();
    drag(screen.getByRole('slider'), 400);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores a sideways drag', () => {
    const { onDismiss, sheet } = setup();
    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 200, clientY: 110 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 200, clientY: 400 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 200, clientY: 400 });
    expect(sheet.style.transform).toBe('');
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
