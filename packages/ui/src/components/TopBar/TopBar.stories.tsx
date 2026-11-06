import type { Meta, StoryObj } from '@storybook/react-vite';
import { PillButton } from '../PillButton';
import { Select } from '../Select';
import { TopBar } from './TopBar';

const meta = {
  title: 'Common/TopBar',
  component: TopBar,
  args: {
    start: <strong>Storyshelf</strong>,
    centre: (
      <Select
        label="Library"
        hideLabel
        value="a"
        onChange={() => undefined}
        options={[
          { value: 'a', label: 'Fiction' },
          { value: 'b', label: 'Non-fiction' },
        ]}
      />
    ),
    end: <PillButton>Sign out</PillButton>,
  },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const StartAndEndOnly: Story = { args: { centre: undefined } };
