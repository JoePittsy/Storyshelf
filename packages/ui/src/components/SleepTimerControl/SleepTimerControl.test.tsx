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
  it('reports the choice made', async () => {
    const onChange = vi.fn();
    render(<SleepTimerControl value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '30 minutes', hidden: true }));
    await userEvent.click(screen.getByRole('button', { name: 'End of chapter', hidden: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Off', hidden: true }));
    expect(onChange.mock.calls).toEqual([[{ minutes: 30 }], ['chapter'], ['off']]);
  });
  it('can disable the chapter option', () => {
    render(<SleepTimerControl value={null} onChange={vi.fn()} chapterOptionDisabled />);
    expect(screen.getByRole('button', { name: 'End of chapter', hidden: true })).toBeDisabled();
  });
});
