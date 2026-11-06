import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { portrait } from '../../../.storybook/fixtures';
import { PersonLink } from './PersonLink';

const meta = {
  title: 'Common/PersonLink',
  component: PersonLink,
  args: { name: 'Gaiman, Neil', caption: '9 books', href: '/author/1', onOpen: fn() },
  decorators: [
    (Story) => (
      <div style={{ width: '18em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PersonLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};
export const WithPhoto: Story = { args: { imageUrl: portrait } };
export const LongName: Story = { args: { name: 'Fergus Westlake-Montgomery the Third of Leeds' } };
