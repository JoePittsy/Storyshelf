import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MoreMenu } from './MoreMenu';

// A surface's secondary actions behind one quiet button, beside its primary pill.
const meta = {
  title: 'Common/MoreMenu',
  component: MoreMenu,
  args: {
    label: 'More actions',
    items: [
      { label: 'Mark as finished', onSelect: fn() },
      { label: 'Reset progress', onSelect: fn(), danger: true },
    ],
  },
} satisfies Meta<typeof MoreMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Busy: Story = { args: { busy: true } };
/** No fill until hovered: for a tile's caption, where a shelf of them should stay quiet. */
export const Quiet: Story = { args: { variant: 'quiet', label: 'More for The Hobbit' } };
