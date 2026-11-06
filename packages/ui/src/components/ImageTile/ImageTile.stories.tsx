import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portrait, portraitCover } from '../../../.storybook/fixtures';
import { ProgressBar } from '../ProgressBar';
import { ImageTile } from './ImageTile';

const meta = {
  title: 'Common/ImageTile',
  component: ImageTile,
  args: { title: 'Golden Hour', sub: 'Maya Rowan', imageUrl: covers.sunset, onOpen: fn(), onHover: fn() },
  // A tile fills its container; the grid sets the width.
  decorators: [
    (Story) => (
      <div style={{ width: '12em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Circular: Story = { args: { title: 'Maya Rowan', sub: '412 items', imageUrl: portrait, circular: true } };
export const Small: Story = { args: { size: 'sm', meta: 'Yesterday' } };
export const WithAddButton: Story = { args: { onAdd: fn() } };
export const AsLinkWithProgress: Story = {
  args: { href: '/book/1', overlay: <ProgressBar value={0.4} label="Progress through Golden Hour" variant="overlay" /> },
};
export const NoArt: Story = { args: { imageUrl: null } };
export const SquareCover: Story = { args: { imageUrl: covers.sunset, artFit: 'cover' } };
export const SquareContain: Story = { args: { imageUrl: covers.sunset, artFit: 'contain' } };
/** A 2:3 print cover in the square: `cover` crops the edge text. */
export const PortraitCover: Story = { args: { imageUrl: portraitCover, artFit: 'cover' } };
/** The whole cover shows over a blurred copy of itself. */
export const PortraitContain: Story = { args: { imageUrl: portraitCover, artFit: 'contain' } };
/** A shelf of mixed covers, all `contain`: every frame stays square. */
export const MixedGrid: Story = {
  decorators: [
    () => (
      <ul
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 12em)', gap: '1.4em', listStyle: 'none', padding: 0, margin: 0 }}
      >
        {[covers.sunset, portraitCover, covers.forest, portraitCover].map((src, i) => (
          <li key={i}>
            <ImageTile title={i % 2 ? 'A Crown of Swords' : 'Golden Hour'} sub="Author" imageUrl={src} artFit="contain" onOpen={fn()} />
          </li>
        ))}
      </ul>
    ),
  ],
};
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Collection That Will Not Fit on One Line',
    sub: 'A Band With A Very Long Name, Featuring Several Other Collaborating Artists',
    meta: 'Played 3 hours ago',
  },
};
export const TitleOnly: Story = { args: { sub: null } };
export const WithPlayButton: Story = {
  args: {
    onPlay: fn(),
    href: '/book/1',
    overlay: <ProgressBar value={0.14} label="Progress through Golden Hour" variant="overlay" />,
  },
};
