import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityRow } from './ActivityRow';
import { ImageTile } from '../ImageTile';

const inList = (ui: React.ReactNode) => render(<ul>{ui}</ul>);

describe('ActivityRow', () => {
  it('is a link that calls onOpen on a plain click and leaves modified clicks to the browser', async () => {
    const onOpen = vi.fn();
    inList(<ActivityRow title="Mythos" href="/book/1" onOpen={onOpen} when="21:40" trailing="48 min" />);
    const link = screen.getByRole('link', { name: /Mythos/ });
    expect(link).toHaveAttribute('href', '/book/1');
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(link, { ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is a button with only onOpen, and plain text with neither', async () => {
    const onOpen = vi.fn();
    const { unmount } = inList(<ActivityRow title="Mythos" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /Mythos/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();
    inList(<ActivityRow title="Mythos" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows every figure it is given, and drops the thumbnail on request', () => {
    inList(<ActivityRow title="Mythos" detail="Ch 7" note="iPhone" when="21:40" trailing="48 min" showArt={false} />);
    for (const t of ['Mythos', 'Ch 7', 'iPhone', '21:40', '48 min']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('ImageTile play button', () => {
  it('plays without opening the tile, and is named for the book', async () => {
    const onOpen = vi.fn();
    const onPlay = vi.fn();
    render(<ImageTile title="Mythos" onOpen={onOpen} onPlay={onPlay} />);
    await userEvent.click(screen.getByRole('button', { name: 'Play Mythos' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('takes a custom label and is absent without onPlay', () => {
    const { rerender } = render(<ImageTile title="Mythos" onOpen={vi.fn()} onPlay={vi.fn()} playLabel="Resume Mythos" />);
    expect(screen.getByRole('button', { name: 'Resume Mythos' })).toBeInTheDocument();
    rerender(<ImageTile title="Mythos" onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Resume|Play/ })).not.toBeInTheDocument();
  });
});
