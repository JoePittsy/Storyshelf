import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portraitCover } from '../../../.storybook/fixtures';
import { Artwork } from '../Artwork';
import { UpNextCard } from './UpNextCard';

const art = (src: string) => <Artwork src={src} fit="contain" lazy={false} />;

const meta = {
  title: 'Playback/UpNextCard',
  component: UpNextCard,
  args: {
    art: art(covers.forest),
    title: 'The Adventure of the Copper Beeches',
    href: '/book/2',
    caption: 'Book 2 of Sherlock Holmes',
    actionLabel: 'Start',
    wash: '47, 182, 106',
    onOpen: fn(),
    onPlay: fn(),
    onDismiss: fn(),
  },
  // The card is a container itself; the page gives it a width.
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '36em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UpNextCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Now Playing on a desk: a labelled pill and a close. */
export const Default: Story = {};
/** Phone width: a round Play, the words wrapping beside it. */
export const Phone: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '335px' }}>
        <Story />
      </div>
    ),
  ],
};
/** Already begun: Continue, with the time left in the caption. */
export const Continue: Story = { args: { actionLabel: 'Continue', caption: 'Book 2 of Sherlock Holmes · 51m left' } };
export const Loading: Story = { args: { busy: true } };
/** On a book's page: its own heading, and no close. */
export const NextInSeries: Story = {
  args: { heading: 'Next in Sherlock Holmes', caption: 'Book 2', onDismiss: undefined },
};
/** On the mini player: an opaque strip, its content in the app's column. */
export const Bar: Story = {
  args: { variant: 'bar' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'none', width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};
export const BarPhone: Story = {
  args: { variant: 'bar' },
  decorators: [
    (Story) => (
      <div style={{ width: '375px' }}>
        <Story />
      </div>
    ),
  ],
};
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long and Winding Adventures of a Very Patient Detective in the Fog',
    caption: 'Book 12.5 of The Collected Cases of Sherlock Holmes and Doctor Watson',
  },
};
export const PortraitCover: Story = { args: { art: art(portraitCover), wash: '217, 164, 65' } };
export const NoArt: Story = { args: { art: <Artwork src={null} fit="contain" />, wash: null } };
