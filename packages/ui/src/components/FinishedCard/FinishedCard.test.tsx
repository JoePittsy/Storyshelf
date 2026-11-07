import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FinishedCard } from './FinishedCard';

describe('FinishedCard', () => {
  it('is a region named by its title, a real heading, with the line under it', () => {
    cleanup();
    render(<FinishedCard detail="1h 3m over 4 days" action={{ label: 'Back to library', onClick: () => {} }} />);
    expect(screen.getByRole('region', { name: 'Finished' })).toHaveTextContent('1h 3m over 4 days');
    expect(screen.getByRole('heading', { name: 'Finished' })).toBeInTheDocument();
  });

  it('has no line when there is nothing to say, and no second action unless given one', () => {
    cleanup();
    render(<FinishedCard action={{ label: 'Back to library', onClick: () => {} }} />);
    expect(screen.getByRole('region', { name: 'Finished' }).querySelector('p')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('runs each action', () => {
    cleanup();
    const go = vi.fn();
    const again = vi.fn();
    render(
      <FinishedCard
        action={{ label: 'Back to library', onClick: go }}
        secondary={{ label: 'Play again', onClick: again }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(again).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledOnce();
  });
});
