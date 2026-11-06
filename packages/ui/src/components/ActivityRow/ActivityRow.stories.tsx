import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { ActivityRow } from './ActivityRow';

const meta = {
  title: 'Common/ActivityRow',
  component: ActivityRow,
  args: {
    title: 'Mythos',
    detail: 'Ch 7 → Ch 9',
    note: 'iPhone · Storyshelf',
    when: '21:40',
    trailing: '48 min',
    imageUrl: covers.ocean,
    onOpen: fn(),
  },
  // Rows render inside a list; the list's width decides the layout.
  decorators: [
    (Story, { parameters }) => (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: (parameters.width as string | undefined) ?? '60em' }}>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof ActivityRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AsLink: Story = { args: { href: '/book/1' } };
export const Plain: Story = { args: { onOpen: undefined } };
export const NoArt: Story = { args: { showArt: false, imageUrl: undefined } };
export const NoTime: Story = { args: { when: undefined } };
export const Minimal: Story = { args: { detail: undefined, note: undefined, when: undefined } };
export const LongTitle: Story = {
  args: { title: 'The Extraordinarily Long Title of a Story That Has To Be Truncated Before It Pushes the Row Wider' },
};
/** The row answers to its own width: this is the phone layout, in a wide window. */
export const Narrow: Story = { parameters: { width: '22em' } };
