import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { freshHistory, routerHears, settle } from '../../test/history';

function Opener({ onSubmit }: { onSubmit?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      {open && (
        <Dialog
          title="Rename"
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
          actions={<button type="submit">Save</button>}
        >
          <input aria-label="Name" />
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('is a modal dialog named by its title, portalled to body', () => {
    render(
      <Dialog title="Past games" onClose={vi.fn()}>
        body
      </Dialog>
    );
    const dialog = screen.getByRole('dialog', { name: 'Past games' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog.parentElement).toBe(document.body);
  });

  it('focuses the first field, and returns focus to the opener on close', async () => {
    const user = userEvent.setup();
    render(<Opener />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open it' })).toHaveFocus();
  });

  it('keeps Esc from reaching page-level handlers', async () => {
    const pageEsc = vi.fn();
    document.addEventListener('keydown', pageEsc);
    const user = userEvent.setup();
    render(<Opener />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', pageEsc);
    expect(pageEsc).not.toHaveBeenCalled();
  });

  it('with onSubmit, a submit button in the action row submits the form', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Opener onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('closes on the native cancel event (backdrop click with closedby="any")', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Info" onClose={onClose}>
        body
      </Dialog>
    );
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalled();
  });

  describe('Back', () => {
    beforeEach(freshHistory);

    it('closes it, leaves the route alone and returns focus to the opener', async () => {
      const router = routerHears();
      const user = userEvent.setup();
      render(<Opener />);
      const opener = screen.getByRole('button', { name: 'Open it' });
      await user.click(opener);
      await settle();
      history.back();
      await settle();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(location.pathname).toBe('/b');
      expect(router.heard).toEqual([]);
      expect(opener).toHaveFocus();
      router.stop();
    });

    it('leaves history as it was after a normal close: the next Back goes to the previous route', async () => {
      const router = routerHears();
      const user = userEvent.setup();
      render(<Opener />);
      await user.click(screen.getByRole('button', { name: 'Open it' }));
      await settle();
      await user.keyboard('{Escape}');
      await settle();
      expect(router.heard).toEqual([]);
      history.back();
      await settle();
      expect(location.pathname).toBe('/a');
      expect(router.heard).toEqual(['/a']);
      router.stop();
    });

    it('closes when unmounted by its parent, with no stray entry', async () => {
      const router = routerHears();
      const { unmount } = render(
        <Dialog title="Info" onClose={vi.fn()}>
          body
        </Dialog>
      );
      await settle();
      unmount();
      await settle();
      history.back();
      await settle();
      expect(location.pathname).toBe('/a');
      expect(router.heard).toEqual(['/a']);
      router.stop();
    });

    it('a form dialog closes on Back too', async () => {
      const onClose = vi.fn();
      render(
        <Dialog title="Rename" onClose={onClose} onSubmit={vi.fn()}>
          <input aria-label="Name" />
        </Dialog>
      );
      await settle();
      history.back();
      await settle();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes only the top one of two', async () => {
      const lower = vi.fn();
      const upper = vi.fn();
      render(
        <>
          <Dialog title="Lower" onClose={lower}>
            a
          </Dialog>
          <Dialog title="Upper" onClose={upper}>
            b
          </Dialog>
        </>
      );
      await settle();
      history.back();
      await settle();
      expect(upper).toHaveBeenCalledTimes(1);
      expect(lower).not.toHaveBeenCalled();
    });
  });
});
