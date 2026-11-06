import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionRow } from './ActionRow';

describe('ActionRow', () => {
  it('opens from the row, and each action is its own named button that does not open the row', () => {
    const onOpen = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <ul>
        <ActionRow
          title="Roast mutton"
          detail="Chapter 2"
          trailing="12:34"
          onOpen={onOpen}
          actions={[
            { icon: 'rename', label: 'Rename Roast mutton', onClick: onRename },
            { icon: 'delete', label: 'Delete Roast mutton', onClick: onDelete },
          ]}
        />
      </ul>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roast mutton 12:34 Chapter 2' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Roast mutton' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Roast mutton' }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
