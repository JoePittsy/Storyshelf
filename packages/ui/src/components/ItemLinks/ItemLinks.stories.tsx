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
/** With `hrefFor` each name is a real link: Ctrl/Cmd-click and middle-click open it in a new tab, a plain click calls `onOpenPerson`. */
export const WithLinks: Story = {
  args: {
    people: 'Maya Rowan, The Quiet Hours, Snoop Dogg',
    hrefFor: (name: string) => `/author/${encodeURIComponent(name)}`,
  },
};
/** A name with no destination stays a button. */
export const PartlyLinked: Story = {
  args: {
    people: 'Maya Rowan, The Quiet Hours',
    hrefFor: (name: string) => (name === 'Maya Rowan' ? '/author/maya' : undefined),
  },
};
export const Title: Story = {
  render: () => <TitleButton title="Golden Hour" onOpen={fn()} />,
};
export const TitleLink: Story = {
  render: () => <TitleButton title="Golden Hour" href="/series/golden-hour" onOpen={fn()} />,
};
