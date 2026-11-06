import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

function Trigger({ onUndo = () => {} }: { onUndo?: () => void }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast('Jumped', 'info', { action: { label: 'Undo', onClick: onUndo }, durationMs: 1000 })}>
      jump
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('replaces a toast with the same replaceKey instead of stacking', () => {
    function Keyed() {
      const { showToast } = useToast();
      return (
        <>
          <button type="button" onClick={() => showToast('First', 'info', { replaceKey: 'k' })}>one</button>
          <button type="button" onClick={() => showToast('Second', 'info', { replaceKey: 'k' })}>two</button>
        </>
      );
    }
    render(<ToastProvider><Keyed /></ToastProvider>);
    fireEvent.click(screen.getByText('one'));
    fireEvent.click(screen.getByText('two'));
    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('closes after its duration', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText('jump'));
    expect(screen.getByText('Jumped')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByText('Jumped')).toBeNull();
  });

  it('waits while hovered, then finishes the time that was left', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText('jump'));
    const toast = screen.getByText('Jumped');
    act(() => void vi.advanceTimersByTime(600));
    fireEvent.mouseEnter(toast);
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByText('Jumped')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.getByText('Jumped')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByText('Jumped')).toBeNull();
  });

  it('runs Undo, closes, and gives focus back to the control that raised it', async () => {
    const undo = vi.fn();
    render(<ToastProvider><Trigger onUndo={undo} /></ToastProvider>);
    const trigger = screen.getByText('jump');
    trigger.focus();
    fireEvent.click(trigger);
    const button = screen.getByRole('button', { name: 'Undo' });
    button.focus();
    fireEvent.click(button);
    await act(async () => {});
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Jumped')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not take focus when it times out and focus is somewhere real', () => {
    render(<ToastProvider><Trigger /><input aria-label="other" /></ToastProvider>);
    const trigger = screen.getByText('jump');
    trigger.focus();
    fireEvent.click(trigger);
    const other = screen.getByLabelText('other');
    other.focus();
    act(() => void vi.advanceTimersByTime(1100));
    expect(document.activeElement).toBe(other);
  });
});

describe('Toast live regions and shortcut', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function Raise({ type, onUndo = () => {} }: { type: 'error' | 'info'; onUndo?: () => void }) {
    const { showToast } = useToast();
    return (
      <>
        <button
          type="button"
          onClick={() => showToast('Message', type, { action: { label: 'Undo', onClick: onUndo, shortcutKey: 'u' } })}
        >
          raise
        </button>
        <input aria-label="field" />
      </>
    );
  }

  it('announces errors assertively and everything else politely', () => {
    render(<ToastProvider><Raise type="error" /></ToastProvider>);
    fireEvent.click(screen.getByText('raise'));
    expect(screen.getByRole('alert')).toContainElement(screen.getByText('Message'));
    cleanup();
    render(<ToastProvider><Raise type="info" /></ToastProvider>);
    fireEvent.click(screen.getByText('raise'));
    expect(screen.getByRole('status')).toContainElement(screen.getByText('Message'));
    expect(screen.getByRole('alert')).not.toContainElement(screen.getByText('Message'));
  });

  it('runs the action from its shortcut key and closes', () => {
    const undo = vi.fn();
    render(<ToastProvider><Raise type="info" onUndo={undo} /></ToastProvider>);
    fireEvent.click(screen.getByText('raise'));
    fireEvent.keyDown(document.body, { key: 'U' });
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Message')).toBeNull();
  });

  it('leaves the key alone in a field, with a modifier, or once the toast is gone', () => {
    const undo = vi.fn();
    render(<ToastProvider><Raise type="info" onUndo={undo} /></ToastProvider>);
    fireEvent.click(screen.getByText('raise'));
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'u' });
    fireEvent.keyDown(document.body, { key: 'u', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(4100));
    fireEvent.keyDown(document.body, { key: 'u' });
    expect(undo).not.toHaveBeenCalled();
  });
});
