import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AirPlayButton } from './AirPlayButton';

describe('AirPlayButton', () => {
  it('is named AirPlay and opens the picker', async () => {
    cleanup();
    const onClick = vi.fn();
    render(<AirPlayButton onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'AirPlay' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('says when playback is on an AirPlay device, keeping its name', () => {
    cleanup();
    render(<AirPlayButton onClick={() => {}} active />);
    const button = screen.getByRole('button', { name: 'AirPlay' });
    expect(button).toHaveAccessibleDescription('Playing on an AirPlay device');
    expect(button).toHaveAttribute('data-active', 'true');
  });
});
