import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SleepTimerControl } from './SleepTimerControl';
import type { SleepValue } from './sleep';

// The story owns the timer, as an app would; a minutes choice here just shows 30:00 (no countdown runs).
function Controlled(props: Parameters<typeof SleepTimerControl>[0]) {
  const [value, setValue] = useState<SleepValue>(props.value);
  return (
    <div style={{ paddingTop: '20em' }}>
      <SleepTimerControl
        {...props}
        value={value}
        onChange={(c) => {
          setValue(
            c === 'off'
              ? null
              : c === 'chapter'
                ? { kind: 'chapter' }
                : { kind: 'minutes', remainingMs: c.minutes * 60000 }
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
