import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ResumeHero } from './ResumeHero';

const base = {
  art: <span data-testid="art" />,
  title: 'The Velveteen Rabbit',
  sub: 'Margery Williams',
  status: 'Chapter 3 of 12 · 4h 12m left',
  progress: 0.42,
  progressLabel: 'Progress through The Velveteen Rabbit',
  onOpen: () => {},
  onAction: () => {},
};

describe('ResumeHero', () => {
  it('shows where you are, and a progress bar', () => {
    cleanup();
    render(<ResumeHero {...base} />);
    expect(screen.getByText('Chapter 3 of 12 · 4h 12m left')).toBeInTheDocument();
    expect(screen.getByText('Margery Williams')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress through The Velveteen Rabbit' })).toHaveAttribute(
      'aria-valuenow',
      '42'
    );
  });

  it('is a named region whose action reads Resume, and names the book', () => {
    cleanup();
    const onAction = vi.fn();
    render(<ResumeHero {...base} onAction={onAction} />);
    expect(screen.getByRole('region', { name: 'Resume listening' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume: The Velveteen Rabbit' }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('reads Pause while playing', () => {
    cleanup();
    render(<ResumeHero {...base} playing />);
    expect(screen.getByRole('button', { name: 'Pause: The Velveteen Rabbit' })).toBeInTheDocument();
  });

  it('marks the action busy while loading', () => {
    cleanup();
    render(<ResumeHero {...base} busy />);
    expect(screen.getByRole('button', { name: /^Resume/ })).toHaveAttribute('aria-busy', 'true');
  });

  it('opens the media from the title; a plain click on a link does not navigate', () => {
    cleanup();
    const onOpen = vi.fn();
    render(<ResumeHero {...base} href="/book/1" onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: 'The Velveteen Rabbit' });
    expect(link).toHaveAttribute('href', '/book/1');
    expect(fireEvent.click(link)).toBe(false);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
