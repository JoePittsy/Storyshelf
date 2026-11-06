import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SpeedControl } from './SpeedControl';

// The story owns the rate, as an app would. The popover is native, so it also closes on Esc and outside click.
function Controlled(props: Parameters<typeof SpeedControl>[0]) {
  const [value, setValue] = useState(props.value);
  return (
    <div style={{ paddingTop: '14em' }}>
      <SpeedControl
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          props.onChange(v);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Playback/SpeedControl',
  component: Controlled,
  args: { value: 1.3, onChange: fn() },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Normal: Story = { args: { value: 1 } };
/** The popover open: the slider and the presets. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /playback speed/i }));
    await expect(within(canvasElement).getByRole('slider', { name: 'Speed' })).toBeVisible();
  },
};
export const CustomRange: Story = { args: { value: 1.25, min: 0.75, max: 2, step: 0.25, presets: [1, 1.25, 1.5, 2] } };
