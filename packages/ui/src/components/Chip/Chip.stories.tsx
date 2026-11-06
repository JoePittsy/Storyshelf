import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { portrait } from '../../../.storybook/fixtures';
import { Chip } from './Chip';

const meta = {
  title: 'Common/Chip',
  component: Chip,
  args: { label: 'Neil Gaiman', href: '/author/1', onOpen: fn() },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextOnly: Story = { args: { label: 'The Sandman', kind: 'Series', meta: '10 books' } };
export const WithInitials: Story = { args: { avatar: { name: 'Neil Gaiman' }, kind: 'Author', meta: '9 books' } };
export const WithPhoto: Story = { args: { avatar: { name: 'Neil Gaiman', imageUrl: portrait }, kind: 'Author' } };
export const LongName: Story = {
  args: { label: 'Fergus Westlake-Montgomery the Third of Leeds', avatar: { name: 'Fergus' } },
  decorators: [
    (Story) => (
      <div style={{ width: 220 }}>
        <Story />
      </div>
    ),
  ],
};
