import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { StatGrid } from './StatGrid';

const items = [
  { label: 'This week', value: '6h 12m' },
  { label: 'This month', value: '21h 40m' },
  { label: 'This year', value: '312h 05m', sub: 'Since 1 January' },
];

const meta = {
  title: 'Stats/StatGrid',
  component: StatGrid,
  args: { items },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '52em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Four: Story = { args: { items: [...items, { label: 'All time', value: '1,204h 30m' }] } };
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '20em' }}>
        <Story />
      </div>
    ),
  ],
  // Two across on a phone: the third card takes the whole second row rather than sitting alone in half of it.
  play: async ({ canvasElement }) => {
    const grid = canvasElement.querySelector('dl') as HTMLElement;
    const [a, b, c] = Array.from(grid.children) as HTMLElement[];
    await expect(a?.getBoundingClientRect().top).toBe(b?.getBoundingClientRect().top);
    await expect(Math.round(c?.getBoundingClientRect().width ?? 0)).toBe(
      Math.round(grid.getBoundingClientRect().width)
    );
  },
};
/** Three across with four cards: the fourth spans the row. An even pair on a phone is left alone. */
export const FourInThreeColumns: Story = {
  args: { items: [...items, { label: 'All time', value: '1,204h 30m' }] },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '32em' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const grid = canvasElement.querySelector('dl') as HTMLElement;
    const cards = Array.from(grid.children) as HTMLElement[];
    await expect(cards[0]?.getBoundingClientRect().top).toBe(cards[2]?.getBoundingClientRect().top);
    await expect(Math.round(cards[3]?.getBoundingClientRect().width ?? 0)).toBe(
      Math.round(grid.getBoundingClientRect().width)
    );
  },
};
export const PairOnAPhone: Story = {
  args: { items: items.slice(0, 2) },
  decorators: Narrow.decorators,
  play: async ({ canvasElement }) => {
    const [a, b] = Array.from((canvasElement.querySelector('dl') as HTMLElement).children) as HTMLElement[];
    await expect(a?.getBoundingClientRect().top).toBe(b?.getBoundingClientRect().top);
  },
};
