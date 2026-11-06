import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { PeopleLinks, TitleButton } from './ItemLinks';

const meta = {
  title: 'Common/ItemLinks',
  component: PeopleLinks,
  args: { people: 'Maya Rowan', onOpenPerson: fn() },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '24em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PeopleLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SinglePerson: Story = {};
export const SeveralPeople: Story = { args: { people: 'Maya Rowan, The Quiet Hours, Snoop Dogg' } };
/** A wrapped credit never starts a line with a comma. */
export const WrappingCredit: Story = {
  args: {
    people: 'A Band With A Very Long Name, Another Featured Artist With A Long Name, And Yet Another Collaborator',
  },
};
export const Title: Story = {
  render: () => <TitleButton title="Golden Hour" onOpen={fn()} />,
};
