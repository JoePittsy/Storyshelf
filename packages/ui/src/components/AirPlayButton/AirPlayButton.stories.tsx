import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AirPlayButton } from './AirPlayButton';

// Shown by the app only when Safari reports an AirPlay target; it opens the system picker.
const meta = {
  title: 'Playback/AirPlayButton',
  component: AirPlayButton,
  args: { onClick: fn() },
} satisfies Meta<typeof AirPlayButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Playing on an AirPlay device: lit. */
export const Streaming: Story = { args: { active: true } };
