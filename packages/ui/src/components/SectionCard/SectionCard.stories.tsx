import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { covers, portrait } from '../../../.storybook/fixtures';
import { ImageTile } from '../ImageTile';
import { PillButton } from '../PillButton';
import { UserAvatar } from '../UserAvatar';
import { SectionCard, SeeAll } from './SectionCard';

const tiles = (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1em' }}>
    {[covers.sunset, covers.ocean, covers.forest, covers.neon].map((c, i) => (
      <ImageTile key={i} title={`Collection ${i + 1}`} sub="Maya Rowan" imageUrl={c} onOpen={fn()} />
    ))}
  </div>
);

const meta = {
  title: 'Common/SectionCard',
  component: SectionCard,
  args: { title: 'Jump back in', children: tiles },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '52em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithSub: Story = { args: { sub: 'A line on what this section shows.' } };
/** A long sub wraps at a readable measure on a wide card, not at the card's full width. */
export const LongSub: Story = {
  args: {
    sub: 'The map of the whole year fills in as you listen. Until then, these are your last seven days, with the busiest one at the top of the list.',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '90em' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const sub = canvasElement.querySelector('section > p') as HTMLElement;
    const text = sub.textContent ?? '';
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    ctx.font = getComputedStyle(sub).font;
    const perLine = sub.getBoundingClientRect().width / (ctx.measureText(text).width / text.length);
    await expect(perLine).toBeGreaterThan(64);
    await expect(perLine).toBeLessThan(76);
  },
};
export const WithSeeAll: Story = { args: { actions: <SeeAll onClick={fn()} /> } };
export const WithButtonAction: Story = { args: { actions: <PillButton>New collection</PillButton> } };
export const WithHeadContent: Story = {
  args: {
    title: 'Reading now',
    headContent: (
      <span style={{ display: 'inline-flex', gap: '0.3em' }}>
        {['Priya Shah', 'Tom Ellis', 'Aisha Khan'].map((n, i) => (
          <UserAvatar key={n} name={n} imageUrl={i === 0 ? portrait : null} />
        ))}
      </span>
    ),
  },
};
export const Featured: Story = { args: { featured: true, wash: '255, 122, 69', title: 'Featured' } };
export const FeaturedNoWash: Story = { args: { featured: true, title: 'Featured' } };
export const NoTitle: Story = { args: { title: undefined } };
