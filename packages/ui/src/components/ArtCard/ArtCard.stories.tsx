import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portrait } from '../../../.storybook/fixtures';
import { ArtCard } from './ArtCard';
import { PeopleLinks } from '../ItemLinks';

const meta = {
  title: 'Common/ArtCard',
  component: ArtCard,
  args: {
    size: 'large',
    label: 'Pick of the week',
    title: 'Golden Hour',
    sub: 'Maya Rowan',
    imageUrl: covers.sunset,
    openLabel: 'Open Golden Hour',
    onOpen: fn(),
    onMouseEnter: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '26em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArtCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = {};
export const Medium: Story = { args: { size: 'medium' } };
export const WithPhoto: Story = { args: { photoUrl: portrait, label: 'Author' } };
/** A broken URL drops its layer, leaving the raised-slate card behind the caption. */
export const BrokenImage: Story = { args: { imageUrl: 'data:image/png;base64,broken' } };
export const WithAddButton: Story = { args: { onAdd: fn() } };
export const WithPeopleLinks: Story = {
  args: { sub: <PeopleLinks people="Maya Rowan, The Quiet Hours" onOpenPerson={fn()} /> },
};
export const NoArt: Story = { args: { imageUrl: null } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Collection That Will Wrap Onto Several Lines of the Caption',
    sub: 'A Band With A Very Long Name, Featuring Several Other Collaborating Artists',
  },
};
