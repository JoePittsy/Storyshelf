import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { Tabs } from './Tabs';

const items = [
  { key: 'books', label: 'Library', href: '/' },
  { key: 'authors', label: 'Authors', href: '/authors' },
  { key: 'narrators', label: 'Narrators', href: '/narrators' },
  { key: 'series', label: 'Series', href: '/series' },
];

const withSettings = [
  ...items,
  { key: 'history', label: 'History', href: '/history' },
  { key: 'settings', label: 'Settings', href: '/settings', icon: 'settings' as const, separated: true },
];

const meta = {
  title: 'Common/Tabs',
  component: Tabs,
  args: { label: 'Library sections', items, current: 'books', onNavigate: fn() },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Settings sits after a divider; at phone widths (30em and under) it becomes a gear with the same name. */
export const WithSettings: Story = { args: { items: withSettings, current: 'settings' } };
export const SecondTab: Story = { args: { current: 'authors' } };
/** Narrower than its tabs: the list scrolls sideways, the page does not. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 200 }}>
        <Story />
      </div>
    ),
  ],
};
/** An iPhone SE's row: the destinations scroll under an edge fade, and Settings stays pinned at the end, in reach. */
export const NarrowWithSettings: Story = {
  args: { items: withSettings },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const nav = c.getByRole('navigation').getBoundingClientRect();
    const settings = c.getByRole('link', { name: 'Settings' }).getBoundingClientRect();
    await expect(settings.width).toBeGreaterThan(0);
    await expect(settings.right).toBeLessThanOrEqual(nav.right + 0.5);
    await expect(settings.left).toBeGreaterThanOrEqual(nav.left);
    await expect(canvasElement.querySelector('ul')).toHaveAttribute('data-overflow', 'true');
  },
};
