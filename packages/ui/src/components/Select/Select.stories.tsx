import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select';

const sorts = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'progress', label: 'Progress' },
];

function Stateful(props: React.ComponentProps<typeof Select>) {
  const [value, setValue] = useState(props.value);
  return <Select {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Common/Select',
  component: Select,
  args: { label: 'Sort by', value: 'recent', options: sorts, onChange: () => {} },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const HiddenLabel: Story = { args: { hideLabel: true } };
export const Disabled: Story = { args: { disabled: true } };
export const LongList: Story = {
  args: {
    label: 'Library',
    value: 'lib-1',
    options: Array.from({ length: 40 }, (_, i) => ({ value: `lib-${i + 1}`, label: `Library ${i + 1}` })),
  },
};
