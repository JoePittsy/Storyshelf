import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { OfferButton } from './OfferButton';

const meta = {
  title: 'Playback/OfferButton',
  component: OfferButton,
  args: { label: 'Go back to where the timer began, 0:41:10', icon: 'moon', onClick: fn() },
} satisfies Meta<typeof OfferButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {};
export const Bar: Story = { args: { variant: 'bar' } };
export const AnotherDevice: Story = {
  args: { label: 'Your iPhone is 42 min ahead · Jump to 3:12:05', shortLabel: 'Jump ahead to 3:12:05', icon: 'devices' },
};
export const Narrow: Story = {
  decorators: [(S) => <div style={{ width: 260 }}>{S()}</div>],
};
