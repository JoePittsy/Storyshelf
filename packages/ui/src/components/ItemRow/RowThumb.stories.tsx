import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { RowThumb } from './ItemRow';

// The thumbnail on its own. It is hidden from assistive tech (the row's title button is the real control), so a
// story here shows the look only; clicking it calls onOpen.
const meta = {
  title: 'Common/RowThumb',
  component: RowThumb,
  args: { imageUrl: covers.forest, onOpen: fn() },
  // The thumbnail sizes itself to its row's grid, so give it a row's 3.2em cell.
  decorators: [
    (Story) => (
      <div style={{ width: '3.2em', height: '3.2em', display: 'grid' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RowThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** No onOpen: a plain, non-interactive thumbnail. */
export const NotClickable: Story = { args: { onOpen: undefined } };
export const NoArt: Story = { args: { imageUrl: null } };
/** A URL that fails to load shows the placeholder. */
export const BrokenImage: Story = { args: { imageUrl: 'data:image/png;base64,broken' } };
