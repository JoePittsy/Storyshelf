import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpeedControl } from './SpeedControl';

describe('SpeedControl', () => {
  it('shows the rate on the button', () => {
    render(<SpeedControl value={1.3} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Playback speed 1.3×' })).toBeInTheDocument();
  });
  it('rounds float noise to the step', () => {
    render(<SpeedControl value={2.0000001} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Playback speed 2×' })).toBeInTheDocument();
  });
  it('clamps an out-of-range value on display', () => {
    render(<SpeedControl value={9} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Playback speed 3×' })).toBeInTheDocument();
  });
  it('clamps and snaps what the slider reports', () => {
    const onChange = vi.fn();
    render(<SpeedControl value={1} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Speed', hidden: true });
    fireEvent.change(slider, { target: { value: '1.2000001' } });
    expect(onChange).toHaveBeenLastCalledWith(1.2);
    fireEvent.change(slider, { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });
  it('picks a preset', async () => {
    const onChange = vi.fn();
    render(<SpeedControl value={1} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '1.5×', hidden: true }));
    expect(onChange).toHaveBeenCalledWith(1.5);
    expect(screen.getByRole('button', { name: '1×', hidden: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
