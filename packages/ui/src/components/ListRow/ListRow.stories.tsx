import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ListRow } from './ListRow';

const meta = {
  title: 'Common/ListRow',
  component: ListRow,
  args: { title: 'Chapter 7: The tide table', aside: '1:02:10', trailing: '24:31', onClick: fn() },
  decorators: [
    (Story) => (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: '36em' }}>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Numbered: Story = { args: { lead: 7 } };
export const Current: Story = { args: { current: true } };
export const TitleOnly: Story = { args: { aside: undefined, trailing: undefined } };
export const LongTitle: Story = {
  args: { title: 'Chapter 19: In which the keeper, having at last run out of candles, reads the whole logbook aloud' },
};
