import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoreMenu } from './MoreMenu';

describe('MoreMenu', () => {
  it('names the button and its panel, and lists the items as buttons', () => {
    render(<MoreMenu label="More actions" items={[{ label: 'Mark as finished', onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'More actions' });
    const panel = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
    expect(panel).toHaveAttribute('popover', 'auto');
    expect(panel).toHaveAttribute('role', 'group');
    expect(panel).toHaveAttribute('aria-label', 'More actions');
    expect(screen.getByRole('button', { name: 'Mark as finished', hidden: true })).toBeInTheDocument();
  });

  it('calls the chosen item, and leaves a disabled one alone', async () => {
    const finish = vi.fn();
    const reset = vi.fn();
    render(
      <MoreMenu
        label="More actions"
        items={[
          { label: 'Mark as finished', onSelect: finish },
          { label: 'Reset progress', onSelect: reset, danger: true, disabled: true },
        ]}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark as finished', hidden: true }));
    expect(finish).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Reset progress', hidden: true }));
    expect(reset).not.toHaveBeenCalled();
  });

  it('says when the work it started is still running', () => {
    render(<MoreMenu label="More actions" items={[]} busy />);
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute('aria-busy', 'true');
  });
});
