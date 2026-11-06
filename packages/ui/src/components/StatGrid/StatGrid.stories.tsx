import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatGrid } from './StatGrid';

const items = [
  { label: 'This week', value: '6h 12m' },
  { label: 'This month', value: '21h 40m' },
  { label: 'This year', value: '312h 05m', sub: 'Since 1 January' },
];

const meta = {
  title: 'Stats/StatGrid',
  component: StatGrid,
  args: { items },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '52em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Four: Story = { args: { items: [...items, { label: 'All time', value: '1,204h 30m' }] } };
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '20em' }}>
        <Story />
      </div>
    ),
  ],
};
