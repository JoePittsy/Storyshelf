import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ImageTile } from './ImageTile';

describe('ImageTile', () => {
  it('separates the title from the author in the link name', () => {
    cleanup();
    render(<ImageTile title="The Velveteen Rabbit" sub="Margery Williams" href="/book/1" onOpen={() => {}} />);
    expect(screen.getByRole('link', { name: /^The Velveteen Rabbit,\s*Margery Williams$/ })).toBeInTheDocument();
  });

  it('puts the full text in a title attribute, for when the line is truncated', () => {
    cleanup();
    render(<ImageTile title="A very long title" sub="Someone" meta="Yesterday" onOpen={() => {}} />);
    expect(screen.getByText('A very long title')).toHaveAttribute('title', 'A very long title');
    expect(screen.getByText('Someone')).toHaveAttribute('title', 'Someone');
  });
});
