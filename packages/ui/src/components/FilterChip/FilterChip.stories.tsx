import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { FilterChip } from './FilterChip';

const meta = {
  title: 'Common/FilterChip',
  component: FilterChip,
  args: { label: 'Fantasy', onRemove: fn() },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithGroup: Story = { args: { label: 'Progress: In progress' } };
export const LongLabel: Story = {
  args: { label: 'Publisher: The Very Long Named Publishing House of Leeds and Surrounding Areas' },
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
};
