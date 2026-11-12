import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SleepTimerControl } from './SleepTimerControl';
import { sleepLabel } from './sleep';

describe('sleepLabel', () => {
  it('says Sleep when off', () => expect(sleepLabel(null)).toBe('Sleep'));
  it('counts down m:ss, then h:mm:ss', () => {
    expect(sleepLabel({ kind: 'minutes', remainingMs: 750000 })).toBe('12:30');
    expect(sleepLabel({ kind: 'minutes', remainingMs: 3725000 })).toBe('1:02:05');
  });
  it('says End of chapter for a chapter timer', () => expect(sleepLabel({ kind: 'chapter' })).toBe('End of chapter'));
});

describe('SleepTimerControl', () => {
  it('shows the label on the button', () => {
    render(<SleepTimerControl value={{ kind: 'minutes', remainingMs: 750000 }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sleep timer, 12:30' })).toHaveTextContent('12:30');
  });
  it('compact, shows a chapter timer’s time left rather than words too wide for a tray cell', () => {
    render(<SleepTimerControl value={{ kind: 'chapter', remainingMs: 672000 }} onChange={vi.fn()} compact />);
    expect(screen.getByRole('button', { name: 'Sleep timer, End of chapter, 11:12' })).toHaveTextContent(/^11:12$/);
  });
  it('compact, falls back to the words for a chapter timer that gives no time', () => {
    render(<SleepTimerControl value={{ kind: 'chapter' }} onChange={vi.fn()} compact />);
    expect(screen.getByRole('button', { name: 'Sleep timer, End of chapter' })).toHaveTextContent('End of chapter');
  });
  it('holds the widest label width with stableWidth, hidden from assistive tech', () => {
    const { container } = render(<SleepTimerControl value={null} onChange={vi.fn()} stableWidth />);
    const label = container.querySelector('button > span:last-of-type');
    expect(label).toHaveTextContent('SleepEnd of chapter');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Sleep timer' })).toBeInTheDocument();
  });
  it('adds no sizer by default', () => {
    const { container } = render(<SleepTimerControl value={null} onChange={vi.fn()} />);
    expect(container.querySelector('button > span:last-of-type')).toHaveTextContent(/^Sleep$/);
  });
  it('reports the choice made', async () => {
    const onChange = vi.fn();
    render(<SleepTimerControl value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '30 minutes', hidden: true }));
    await userEvent.click(screen.getByRole('button', { name: 'End of chapter', hidden: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Off', hidden: true }));
    expect(onChange.mock.calls).toEqual([[{ minutes: 30 }], ['chapter'], ['off']]);
  });
  const rows = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[popover] button')).map((b) => b.textContent);
  it('leads with End of chapter, then 5 to 60 minutes, then Off', () => {
    const { container } = render(<SleepTimerControl value={null} onChange={vi.fn()} />);
    expect(rows(container)).toEqual([
      'End of chapter',
      '5 minutes',
      '10 minutes',
      '15 minutes',
      '30 minutes',
      '45 minutes',
      '60 minutes',
      'Off',
    ]);
  });
  it('offers Add 15 minutes above Off while a minutes timer runs, and only then', () => {
    const running = { kind: 'minutes', remainingMs: 600000, minutes: 30 } as const;
    const { container, rerender } = render(<SleepTimerControl value={running} onChange={vi.fn()} />);
    expect(rows(container).slice(-2)).toEqual(['Add 15 minutes', 'Off']);
    rerender(<SleepTimerControl value={null} onChange={vi.fn()} />);
    expect(rows(container)).not.toContain('Add 15 minutes');
    rerender(<SleepTimerControl value={{ kind: 'chapter', remainingMs: 600000 }} onChange={vi.fn()} />);
    expect(rows(container)).not.toContain('Add 15 minutes');
  });
  it('reports adding minutes, and never ticks that row', async () => {
    const onChange = vi.fn();
    render(<SleepTimerControl value={{ kind: 'minutes', remainingMs: 600000, minutes: 30 }} onChange={onChange} />);
    const add = screen.getByRole('button', { name: 'Add 15 minutes', hidden: true });
    expect(add).toHaveAttribute('aria-pressed', 'false');
    expect(add.querySelector('svg')).toBeNull();
    await userEvent.click(add);
    expect(onChange).toHaveBeenCalledWith({ addMinutes: 15 });
  });
  it('ticks no minutes row for an extended timer, which no longer has a length of its own', () => {
    render(<SleepTimerControl value={{ kind: 'minutes', remainingMs: 1500000 }} onChange={vi.fn()} />);
    const ticked = Array.from(document.querySelectorAll('[popover] button')).filter((b) => b.querySelector('svg'));
    expect(ticked).toEqual([]);
  });
  it('marks the current choice with a tick as well as aria-pressed, not by brightness alone', () => {
    const { rerender } = render(<SleepTimerControl value={null} onChange={vi.fn()} />);
    const option = (name: string) => screen.getByRole('button', { name, hidden: true });
    const ticked = () =>
      Array.from(document.querySelectorAll('[popover] button')).filter((b) => b.querySelector('svg'));
    expect(option('Off')).toHaveAttribute('aria-pressed', 'true');
    expect(ticked()).toEqual([option('Off')]);
    rerender(<SleepTimerControl value={{ kind: 'chapter' }} onChange={vi.fn()} />);
    expect(option('End of chapter')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Off')).toHaveAttribute('aria-pressed', 'false');
    expect(ticked()).toEqual([option('End of chapter')]);
    // A running minutes timer that knows its length ticks that row; the countdown stays on the button.
    rerender(<SleepTimerControl value={{ kind: 'minutes', remainingMs: 600000, minutes: 30 }} onChange={vi.fn()} />);
    expect(option('30 minutes')).toHaveAttribute('aria-pressed', 'true');
    expect(ticked()).toEqual([option('30 minutes')]);
  });
  it('can disable the chapter option', () => {
    render(<SleepTimerControl value={null} onChange={vi.fn()} chapterOptionDisabled />);
    expect(screen.getByRole('button', { name: 'End of chapter', hidden: true })).toBeDisabled();
  });
});
