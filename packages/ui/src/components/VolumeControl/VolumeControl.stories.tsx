import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { VolumeControl } from './VolumeControl';

// The story owns the level and the mute, as an app would.
function Controlled(props: Parameters<typeof VolumeControl>[0]) {
  const [value, setValue] = useState(props.value);
  const [muted, setMuted] = useState(props.muted ?? false);
  return (
    <div style={{ paddingTop: '10em' }}>
      <VolumeControl
        value={value}
        muted={muted}
        onChange={(v) => {
          setValue(v);
          setMuted(false);
          props.onChange(v);
        }}
        onMutedChange={(m) => {
          setMuted(m);
          props.onMutedChange(m);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Playback/VolumeControl',
  component: Controlled,
  args: { value: 0.8, onChange: fn(), onMutedChange: fn() },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Quiet: Story = { args: { value: 0.3 } };
export const Muted: Story = { args: { muted: true } };
/** The popover open: the slider and Mute. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^volume/i }));
    await expect(within(canvasElement).getByRole('slider', { name: 'Volume' })).toBeVisible();
  },
};
