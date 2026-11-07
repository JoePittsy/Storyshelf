import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

type Mode = 'book' | 'chapter' | 'sleep';
const options = [
  { value: 'book' as const, label: 'Book' },
  { value: 'chapter' as const, label: 'Chapter' },
  { value: 'sleep' as const, label: 'Sleep', disabled: true, reason: 'Set a sleep timer first' },
];

function setup(value: Mode = 'book') {
  cleanup();
  const onChange = vi.fn();
  render(<SegmentedControl<Mode> label="Progress" value={value} onChange={onChange} options={options} />);
  return onChange;
}

describe('SegmentedControl', () => {
  it('is a named radio group with the value checked and one tab stop', () => {
    setup('chapter');
    expect(screen.getByRole('radiogroup', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Chapter' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Chapter' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Book' })).toHaveAttribute('tabindex', '-1');
  });
  it('arrow keys move to the next enabled option, wrapping and skipping disabled ones', () => {
    const next = setup('book');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(next).toHaveBeenLastCalledWith('chapter');
    const wrap = setup('chapter');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(wrap).toHaveBeenLastCalledWith('book');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(wrap).toHaveBeenLastCalledWith('book');
  });
  it('a disabled option cannot be chosen and explains why', () => {
    const onChange = setup();
    const sleep = screen.getByRole('radio', { name: 'Sleep' });
    expect(sleep).toBeDisabled();
    expect(sleep).toHaveAccessibleDescription('Set a sleep timer first');
    fireEvent.click(sleep);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('keeps the reason out of the name: the name is the label alone', () => {
    setup();
    expect(screen.getByRole('radio', { name: 'Sleep' })).toHaveAccessibleName('Sleep');
  });
});

describe('SegmentedControl underline variant', () => {
  it('is the same radio group, only styled differently', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Shows"
        variant="underline"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Whole book' },
          { value: 'b', label: 'This chapter' },
        ]}
      />
    );
    expect(screen.getByRole('radio', { name: 'Whole book' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'This chapter' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
