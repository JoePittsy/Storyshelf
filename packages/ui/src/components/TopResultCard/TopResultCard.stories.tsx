import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { PillButton } from '../PillButton';
import { TopResultCard } from './TopResultCard';

const meta = {
  title: 'Common/TopResultCard',
  component: TopResultCard,
  args: {
    title: 'Golden Hour',
    meta: 'Story · Maya Rowan · 2024',
    imageUrl: covers.sunset,
    openLabel: 'Open Golden Hour',
    onOpen: fn(),
    onMouseEnter: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '28em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TopResultCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const CustomHeading: Story = { args: { heading: 'Best match' } };
export const WithActions: Story = {
  args: {
    children: (
      <>
        <PillButton variant="primary">Read now</PillButton>
        <PillButton>Add to shelf</PillButton>
      </>
    ),
  },
};
export const NoArt: Story = { args: { imageUrl: null } };
/** A URL that fails to load is treated as no art. */
export const BrokenImage: Story = { args: { imageUrl: 'data:image/png;base64,broken' } };
export const LongTitle: Story = {
  args: {
    title:
      'The Extraordinarily Long Title of a Story That Is Clamped to Three Lines on the Card, Whatever Else Happens',
  },
};
