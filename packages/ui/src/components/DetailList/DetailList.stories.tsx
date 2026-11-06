import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailList } from './DetailList';

const meta = {
  title: 'Common/DetailList',
  component: DetailList,
  args: {
    items: [
      { label: 'Narrators', value: 'Tim Curry, Hugh Laurie' },
      { label: 'Series', value: 'The Quiet Hours #2' },
      { label: 'Published', value: '2021' },
      { label: 'Publisher', value: 'Harbour Press' },
      { label: 'Genres', value: 'Fantasy, Mystery' },
      { label: 'Language', value: 'English' },
      { label: 'Duration', value: '11h 28m' },
      { label: 'Size', value: '656.4 MB' },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '20em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DetailList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Single: Story = { args: { items: [{ label: 'Duration', value: '11h 28m' }] } };
export const LongValue: Story = {
  args: {
    items: [
      {
        label: 'Narrators',
        value: 'Tim Curry, Hugh Laurie, Jane Horrocks, Bill Nighy, Miriam Margolyes, Stephen Fry, Cat Stevens-Longname',
      },
    ],
  },
};
