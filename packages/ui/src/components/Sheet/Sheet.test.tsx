import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
