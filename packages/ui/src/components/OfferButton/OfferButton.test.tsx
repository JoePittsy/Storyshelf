import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferButton } from './OfferButton';

describe('OfferButton', () => {
  it('is one button, named by its words, that calls back once per tap', () => {
    const onClick = vi.fn();
    render(<OfferButton label="Go back to where the timer began, 41:10" icon="moon" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back to where the timer began, 41:10' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('carries short words for a narrow screen beside the full ones (CSS shows one or the other)', () => {
    render(<OfferButton label="Go back to where the timer began, 41:10" shortLabel="Go back to 41:10" onClick={() => {}} />);
    expect(screen.getByText('Go back to where the timer began, 41:10')).toBeInTheDocument();
    expect(screen.getByText('Go back to 41:10')).toBeInTheDocument();
  });

  it('draws the glyph it is asked for, hidden from assistive tech (the words say it all)', () => {
    const { container, rerender } = render(<OfferButton label="Jump" icon="devices" onClick={() => {}} />);
    expect(container.querySelector('svg[data-icon="devices"]')).toHaveAttribute('aria-hidden', 'true');
    rerender(<OfferButton label="Jump" onClick={() => {}} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('as a bar, puts the class on the strip around it', () => {
    const { container } = render(<OfferButton label="Go back" onClick={() => {}} variant="bar" className="here" />);
    expect(container.firstElementChild).toHaveClass('here');
    expect(screen.getByRole('button')).not.toHaveClass('here');
  });
});
