import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portraitCover } from '../../../.storybook/fixtures';
import { Artwork } from '../Artwork';
import { ResumeHero } from './ResumeHero';

const art = (src: string) => <Artwork src={src} fit="contain" lazy={false} />;

const meta = {
  title: 'Common/ResumeHero',
  component: ResumeHero,
  args: {
    art: art(covers.ocean),
    title: 'The Velveteen Rabbit',
    href: '/book/1',
    sub: 'Margery Williams',
    status: 'Chapter 3 of 12 · 4h 12m left',
    progress: 0.42,
    progressLabel: 'Progress through The Velveteen Rabbit',
    wash: '31, 143, 255',
    onOpen: fn(),
    onAction: fn(),
  },
  // The band is a container itself; the page gives it a width.
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '84em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResumeHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Phone width: art and words on a row, the action full width beneath. */
export const Phone: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '375px' }}>
        <Story />
      </div>
    ),
  ],
};
export const Playing: Story = { args: { playing: true } };
export const Loading: Story = { args: { busy: true } };
export const NoWash: Story = { args: { wash: null } };
export const NoChapters: Story = { args: { status: '4h 12m left' } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long and Winding Adventures of a Very Patient Rabbit in the Nursery',
    sub: 'Margery Williams, illustrated by William Nicholson',
  },
};
export const PortraitCover: Story = { args: { art: art(portraitCover), wash: '217, 164, 65' } };
export const NoArt: Story = { args: { art: <Artwork src={null} fit="contain" />, wash: null } };
