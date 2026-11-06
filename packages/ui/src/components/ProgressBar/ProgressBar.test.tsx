import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

function bar(value: number, showEmpty?: boolean) {
  cleanup();
  render(<ProgressBar value={value} label="Progress" showEmpty={showEmpty} />);
  return screen.queryByRole('progressbar', { name: 'Progress' });
}

describe('ProgressBar', () => {
  it('exposes aria values and text', () => {
    const el = bar(0.4);
    expect(el).toHaveAttribute('aria-valuenow', '40');
    expect(el).toHaveAttribute('aria-valuemin', '0');
    expect(el).toHaveAttribute('aria-valuemax', '100');
    expect(el).toHaveAttribute('aria-valuetext', '40% complete');
  });

  it('clamps out-of-range and non-finite values', () => {
    expect(bar(1.7)).toHaveAttribute('aria-valuenow', '100');
    expect(bar(-3, true)).toHaveAttribute('aria-valuenow', '0');
    expect(bar(Number.NaN, true)).toHaveAttribute('aria-valuenow', '0');
  });

  it('renders nothing at 0 unless showEmpty', () => {
    expect(bar(0)).toBeNull();
    expect(bar(0, true)).not.toBeNull();
  });

  it('shows a check at 1 and not before', () => {
    bar(1);
    expect(document.querySelector('svg')).not.toBeNull();
    bar(0.99);
    expect(document.querySelector('svg')).toBeNull();
  });
});
