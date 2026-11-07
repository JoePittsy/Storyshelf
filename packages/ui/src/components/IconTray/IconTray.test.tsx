import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconTray, TrayButton } from './IconTray';

describe('IconTray', () => {
  it('is a named group of icon buttons, each named for assistive tech', () => {
    const onClick = vi.fn();
    render(
      <IconTray label="Player options">
        <TrayButton icon="chapters" label="Chapters" onClick={onClick} />
        <TrayButton icon="settings" label="Settings" onClick={() => {}} />
      </IconTray>
    );
    const group = screen.getByRole('group', { name: 'Player options' });
    expect(group).toContainElement(screen.getByRole('button', { name: 'Chapters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chapters' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
});
