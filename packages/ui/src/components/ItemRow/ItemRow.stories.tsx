import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { EqBars } from '../EqBars';
import { PeopleLinks } from '../ItemLinks';
import { ItemRow } from './ItemRow';

const credit = <PeopleLinks people="Maya Rowan, The Quiet Hours" onOpenPerson={fn()} />;

const meta = {
  title: 'Common/ItemRow',
  component: ItemRow,
  args: {
    title: 'Golden Hour',
    credit,
    imageUrl: covers.sunset,
    onOpen: fn(),
    onAdd: fn(),
    onMouseEnter: fn(),
  },
  // Rows render inside a list.
  decorators: [
    (Story) => (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: '44em' }}>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof ItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithReason: Story = { args: { reason: 'Because you finished Deep Water twice this month' } };
export const NoArt: Story = { args: { imageUrl: null } };
/** A URL that fails to load shows the placeholder. */
export const BrokenImage: Story = { args: { imageUrl: 'data:image/png;base64,broken' } };
export const TitleOnly: Story = { args: { credit: undefined, onOpen: undefined } };
export const NoAddButton: Story = { args: { onAdd: undefined } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Story That Has To Be Truncated Before It Pushes the Row Wider',
    credit: (
      <PeopleLinks people="A Band With A Very Long Name, Another Featured Author, And A Third" onOpenPerson={fn()} />
    ),
  },
};
export const Selected: Story = { args: { selected: true } };
export const Playing: Story = { args: { playing: true, lead: <EqBars /> } };
export const NumberedItem: Story = {
  args: { lead: 3, showArt: false, trailing: '3:42', credit: undefined, aside: 'Deep Water' },
};
export const Removable: Story = {
  args: {
    handle: true,
    onDragStart: fn(),
    onRemove: fn(),
    trailing: '3:42',
    attribution: { user: 'Priya Shah', onOpen: fn() },
  },
};
