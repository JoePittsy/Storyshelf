import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepperRow } from './StepperRow';

const base = {
  title: 'The Tale of Peter Rabbit',
  hint: '. Opens the chapter list',
  previousLabel: 'Previous chapter',
  nextLabel: 'Next chapter',
};

describe('StepperRow', () => {
  it('routes each of its three buttons', () => {
    const h = { onOpen: vi.fn(), onPrevious: vi.fn(), onNext: vi.fn() };
    render(<StepperRow {...base} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous chapter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    fireEvent.click(screen.getByRole('button', { name: /The Tale of Peter Rabbit.*Opens the chapter list/ }));
    expect(h.onPrevious).toHaveBeenCalledTimes(1);
    expect(h.onNext).toHaveBeenCalledTimes(1);
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows a count only when given, and can disable an end', () => {
    const noop = () => {};
    const { rerender } = render(<StepperRow {...base} onOpen={noop} onPrevious={noop} onNext={noop} nextDisabled />);
    expect(screen.queryByText('2 of 18')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next chapter' })).toBeDisabled();
    rerender(<StepperRow {...base} count="2 of 18" onOpen={noop} onPrevious={noop} onNext={noop} />);
    expect(screen.getByText('2 of 18')).toBeInTheDocument();
  });
});
