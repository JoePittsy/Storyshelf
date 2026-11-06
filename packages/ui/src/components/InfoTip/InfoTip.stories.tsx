import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { Disc3 } from 'lucide-react';
import { InfoTip } from './InfoTip';

// Each story opens its tooltip so it can be seen; in use it opens on hover or keyboard focus.
const meta = {
  title: 'Common/InfoTip',
  component: InfoTip,
  args: { label: 'Why this pick', children: 'Because you finished three stories by Maya Rowan this month.' },
  decorators: [
    (Story) => (
      <div style={{ padding: '1em 1em 14em' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: /^(Why this pick|More about this)$/ }));
  },
} satisfies Meta<typeof InfoTip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const RichContent: Story = {
  args: {
    children: (
      <>
        <strong>Priya</strong> read 14 and <strong>Tom</strong> read 6.
      </>
    ),
  },
};
export const LongContent: Story = {
  args: {
    children:
      'A longer explanation that has to wrap inside the tooltip’s maximum width rather than stretching across the window, and still stay on screen.',
  },
};
export const CustomIcon: Story = {
  args: { label: 'More about this', icon: <Disc3 size={14} aria-hidden="true" /> },
};
