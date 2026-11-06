import type { Meta, StoryObj } from '@storybook/react-vite';
import { Artwork } from '../Artwork';
import { ProgressBar } from './ProgressBar';

const meta = {
  title: 'Common/ProgressBar',
  component: ProgressBar,
  args: { label: 'Progress through The Hobbit', value: 0.4 },
  decorators: [
    (Story) => (
      <div style={{ width: '16em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { value: 0, showEmpty: true } };
export const Partway: Story = {};
export const Finished: Story = { args: { value: 1 } };
export const OverlayOnArtwork: Story = {
  args: { variant: 'overlay' },
  render: (args) => (
    <div
      style={{
        position: 'relative',
        aspectRatio: '1',
        overflow: 'hidden',
        borderRadius: 'var(--r-art)',
        background: 'var(--bg-1)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Artwork src={null} />
      <ProgressBar {...args} />
    </div>
  ),
};
