import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { PersonChip } from '../PersonChip';
import { HeroBand } from './HeroBand';

const meta = {
  title: 'Common/HeroBand',
  component: HeroBand,
  args: {
    art: <img src={covers.ocean} alt="" />,
    kind: 'Collection',
    title: 'Deep Water',
    wash: '31, 143, 255',
    children: <p style={{ margin: 0 }}>The Quiet Hours · 2024 · 11 items</p>,
  },
  // Detail pages are a container, so the band stacks when narrow.
  decorators: [
    (Story) => (
      <div style={{ containerType: 'inline-size' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoWash: Story = { args: { wash: null } };
export const NoArt: Story = {
  args: {
    art: (
      <span style={{ display: 'grid', placeItems: 'center', height: '100%' }} aria-hidden="true">
        ◌
      </span>
    ),
  },
};
export const EditableTitle: Story = {
  args: { kind: 'Playlist', title: 'Friday afternoon', onTitleClick: fn(), titleHint: 'Rename playlist' },
};
export const WithCorner: Story = {
  args: {
    corner: <PersonChip name="Priya Shah" selected={false} onClick={fn()} />,
    children: (
      <>
        <p style={{ margin: 0 }}>The Quiet Hours · 2024 · 11 items</p>
        <p style={{ margin: 0 }}>Added 3 times</p>
      </>
    ),
  },
};
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Collection That Needs to Wrap Without Pushing the Artwork Around',
  },
};
