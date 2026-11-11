import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VolumeControl } from './VolumeControl';

describe('VolumeControl', () => {
  it('names the level on the button', () => {
    render(<VolumeControl value={0.8} onChange={vi.fn()} onMutedChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Volume 80%' })).toBeInTheDocument();
  });
  it('says muted on the button, and keeps the level on the slider', () => {
    render(<VolumeControl value={0.8} muted onChange={vi.fn()} onMutedChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Volume muted' })).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Volume', hidden: true });
    expect(slider).toHaveValue('80');
    expect(slider).toHaveAttribute('aria-valuetext', 'Muted, 80%');
  });
  it('reports the slider as 0 to 1', () => {
    const onChange = vi.fn();
    render(<VolumeControl value={1} onChange={onChange} onMutedChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Volume', hidden: true }), { target: { value: '35' } });
    expect(onChange).toHaveBeenLastCalledWith(0.35);
  });
  it('clamps an out-of-range or junk level on display', () => {
    const { rerender } = render(<VolumeControl value={4} onChange={vi.fn()} onMutedChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Volume 100%' })).toBeInTheDocument();
    rerender(<VolumeControl value={Number.NaN} onChange={vi.fn()} onMutedChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Volume 100%' })).toBeInTheDocument();
  });
  it('Mute toggles, and shows as pressed while muted', async () => {
    const onMutedChange = vi.fn();
    const { rerender } = render(<VolumeControl value={0.5} onChange={vi.fn()} onMutedChange={onMutedChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mute', hidden: true }));
    expect(onMutedChange).toHaveBeenLastCalledWith(true);
    rerender(<VolumeControl value={0.5} muted onChange={vi.fn()} onMutedChange={onMutedChange} />);
    const mute = screen.getByRole('button', { name: 'Mute', hidden: true });
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(mute);
    expect(onMutedChange).toHaveBeenLastCalledWith(false);
  });
});
