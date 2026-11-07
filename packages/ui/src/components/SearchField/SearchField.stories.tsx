import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SearchField } from './SearchField';

// Controlled, so each story keeps its own value.
function Stateful(props: React.ComponentProps<typeof SearchField>) {
  const [value, setValue] = useState(props.value);
  return <SearchField {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Common/SearchField',
  component: SearchField,
  args: { label: 'Search library', placeholder: 'Search books, authors, series', value: '', onChange: () => {} },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithValue: Story = { args: { value: 'Pratchett' } };
export const Disabled: Story = { args: { value: 'Pratchett', disabled: true } };
/** Focused: one outline, the global ring laid over the field's stroke, not a second line 2px outside it. */
export const Focused: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('searchbox');
    await userEvent.click(input);
    await expect(input).toHaveFocus();
    const style = getComputedStyle(input);
    await expect(style.outlineStyle).toBe('solid');
    await expect(style.outlineOffset).toBe('-1px');
  },
};
