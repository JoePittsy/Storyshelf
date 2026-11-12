import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SleepTimerControl } from './SleepTimerControl';
import type { SleepValue } from './sleep';

// The story owns the timer, as an app would; a minutes choice here just shows its length (no countdown runs), and
// adding minutes lengthens it and drops its row's tick, as the player does.
function Controlled(props: Parameters<typeof SleepTimerControl>[0]) {
  const [value, setValue] = useState<SleepValue>(props.value);
  return (
    <div style={{ paddingTop: '20em' }}>
      <SleepTimerControl
        {...props}
        value={value}
        onChange={(c) => {
          setValue((current) =>
            c === 'off'
              ? null
              : c === 'chapter'
                ? { kind: 'chapter' }
                : 'addMinutes' in c
                  ? current?.kind === 'minutes'
                    ? { kind: 'minutes', remainingMs: current.remainingMs + c.addMinutes * 60000 }
                    : current
                  : { kind: 'minutes', remainingMs: c.minutes * 60000, minutes: c.minutes }
          );
          props.onChange(c);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Playback/SleepTimerControl',
  component: Controlled,
  args: { value: null, onChange: fn() },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const Minutes: Story = { args: { value: { kind: 'minutes', remainingMs: 750000 } } };
export const OverAnHour: Story = { args: { value: { kind: 'minutes', remainingMs: 3725000 } } };
export const Chapter: Story = { args: { value: { kind: 'chapter' } } };
/** The popover open, with the chapter option disabled. */
export const Open: Story = {
  args: { chapterOptionDisabled: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /sleep timer/i }));
    await expect(within(canvasElement).getByRole('button', { name: 'Off' })).toBeVisible();
  },
};
/** The list open with an end-of-chapter timer running: the bedtime choice leads the list, and is ticked. */
export const OpenWithChoice: Story = {
  args: { value: { kind: 'chapter' } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /sleep timer/i }));
    const row = within(canvasElement).getByRole('button', { name: 'End of chapter', pressed: true });
    await expect(row).toBeVisible();
    await expect(row.querySelector('svg')).not.toBeNull();
  },
};
/** A minutes timer running: the list offers "Add 15 minutes" above Off, and choosing it lengthens the countdown. */
export const RunningCanExtend: Story = {
  args: { value: { kind: 'minutes', remainingMs: 750000, minutes: 15 } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /sleep timer/i }));
    const add = canvas.getByRole('button', { name: 'Add 15 minutes' });
    await expect(add).toBeVisible();
    await expect(add).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(add);
    await expect(args.onChange).toHaveBeenCalledWith({ addMinutes: 15 });
    await expect(canvas.getByRole('button', { name: 'Sleep timer, 27:30' })).toBeVisible();
  },
};
