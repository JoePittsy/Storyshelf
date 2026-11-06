import type { Meta, StoryObj } from '@storybook/react-vite';
import { covers } from '../../../.storybook/fixtures';
import tile from '../ImageTile/ImageTile.module.css';
import { Artwork } from './Artwork';

// The caller owns the frame; here it is the ImageTile's.
const meta = {
  title: 'Common/Artwork',
  component: Artwork,
  args: { src: covers.forest, placeholderClassName: tile.ph },
  decorators: [
    (Story) => (
      <div className={tile.art} style={{ width: '12em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Artwork>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Eager: Story = { args: { lazy: false } };
/** A URL that fails to load shows the placeholder too. */
export const BrokenImage: Story = { args: { src: 'data:image/png;base64,broken' } };
export const CustomPlaceholder: Story = { args: { src: null, placeholder: '★' } };
/** No URL yet (or none at all): the placeholder. */
export const Placeholder: Story = { args: { src: null } };
