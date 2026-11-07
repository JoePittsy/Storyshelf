import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { IconButton } from './IconButton';

// A header action: Now Playing's way into car mode sits beside the AirPlay button.
const meta = {
  title: 'Playback/IconButton',
  component: IconButton,
  args: { icon: 'car', label: 'Car mode', onClick: fn() },
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** With a keyboard shortcut: named in the tooltip and announced. */
export const WithShortcut: Story = { args: { shortcut: 'C' } };
/** Its neighbour on a desk's Now Playing: the keyboard shortcuts, named and with the key that also opens them. */
export const Keyboard: Story = { args: { icon: 'keyboard', label: 'Keyboard shortcuts', shortcut: '?' } };
