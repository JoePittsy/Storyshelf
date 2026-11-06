import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchField } from './SearchField';

function setup(value = 'dune', onSubmit?: (v: string) => void) {
  cleanup();
  const onChange = vi.fn();
  render(<SearchField label="Search library" value={value} onChange={onChange} onSubmit={onSubmit} />);
  return { input: screen.getByRole('searchbox', { name: 'Search library' }), onChange };
}

describe('SearchField', () => {
  it('Esc clears a value', () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('Esc on an empty field does nothing', () => {
    const { input, onChange } = setup('');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the clear button clears and returns focus to the input', () => {
    const { input, onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(input).toHaveFocus();
  });

  it('has no clear button when empty', () => {
    setup('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('Enter submits the current value', () => {
    const onSubmit = vi.fn();
    const { input } = setup('dune', onSubmit);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('dune');
  });
});
