import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portraitCover } from '../../../.storybook/fixtures';
import { Artwork } from '../Artwork';
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

const art = (src: string, fit: 'cover' | 'contain') => <Artwork src={src} fit={fit} lazy={false} />;
export const SquareCover: Story = { args: { art: art(covers.ocean, 'cover') } };
export const SquareContain: Story = { args: { art: art(covers.ocean, 'contain') } };
/** A 2:3 print cover in the square frame: `cover` crops the edge text. */
export const PortraitCover: Story = { args: { art: art(portraitCover, 'cover'), wash: '217, 164, 65' } };
/** The whole cover shows over a blurred copy of itself; the frame stays square. */
export const PortraitContain: Story = { args: { art: art(portraitCover, 'contain'), wash: '217, 164, 65' } };
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
