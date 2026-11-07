import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColumnChart } from './ColumnChart';
import type { Column } from './ColumnChart';

const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const months = (hours: number[]): Column[] =>
  hours.map((h, i) => ({
    key: String(i),
    label: NAMES[i]!.slice(0, 3),
    short: NAMES[i]!.slice(0, 1),
    name: NAMES[i]!,
    value: h,
    valueLabel: h ? `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m` : 'Nothing',
  }));

const meta = {
  title: 'Stats/ColumnChart',
  component: ColumnChart,
  args: {
    columns: months([12.5, 9, 21.2, 14, 6.5, 3, 18, 25.4, 11, 8.2, 15, 4]),
    label: 'Time listened each month of 2025. Most in August, 25h 24m.',
    nameHeading: 'Month',
    valueHeading: 'Listened',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '40em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ColumnChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Year: Story = {};
/** A year that started in the autumn: the empty months draw nothing. */
export const Partial: Story = {
  args: { columns: months([0, 0, 0, 0, 0, 0, 0, 0, 0, 2.1, 6.4, 0.5]), label: 'Time listened each month of 2026. Most in November.' },
};
/** A phone: one letter a month. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '20em' }}>
        <Story />
      </div>
    ),
  ],
};
