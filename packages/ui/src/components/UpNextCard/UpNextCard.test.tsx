import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { UpNextCard } from './UpNextCard';

const base = {
  art: <span data-testid="art" />,
  title: 'The Adventure of the Copper Beeches',
  caption: 'Book 2 of Sherlock Holmes',
  actionLabel: 'Play',
  onOpen: () => {},
  onPlay: () => {},
};

describe('UpNextCard', () => {
  it('is a region named by its heading, with the title and where it sits', () => {
    cleanup();
    render(<UpNextCard {...base} />);
    expect(screen.getByRole('region', { name: 'Up next' })).toBeInTheDocument();
    expect(screen.getByText('Book 2 of Sherlock Holmes')).toBeInTheDocument();
    expect(screen.getByTestId('art')).toBeInTheDocument();
  });

  it('takes another heading, as its name too', () => {
    cleanup();
    render(<UpNextCard {...base} heading="Next in Sherlock Holmes" />);
    expect(screen.getByRole('region', { name: 'Next in Sherlock Holmes' })).toBeInTheDocument();
  });

  it('plays from an action that says what it does and names the item', () => {
    cleanup();
    const onPlay = vi.fn();
    render(<UpNextCard {...base} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play: The Adventure of the Copper Beeches' }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('marks the action busy while loading', () => {
    cleanup();
    render(<UpNextCard {...base} busy />);
    expect(screen.getByRole('button', { name: /^Play/ })).toHaveAttribute('aria-busy', 'true');
  });

  it('has a close button only when it can be dismissed', () => {
    cleanup();
    const { rerender } = render(<UpNextCard {...base} />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    const onDismiss = vi.fn();
    rerender(<UpNextCard {...base} onDismiss={onDismiss} dismissLabel="Dismiss up next" />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss up next' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('opens the item from the title; a plain click on a link does not navigate', () => {
    cleanup();
    const onOpen = vi.fn();
    render(<UpNextCard {...base} href="/book/2" onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: 'The Adventure of the Copper Beeches' });
    expect(link).toHaveAttribute('href', '/book/2');
    expect(fireEvent.click(link)).toBe(false);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
