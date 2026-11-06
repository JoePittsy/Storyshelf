import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExpandableText } from './ExpandableText';

const long = Array.from(
  { length: 12 },
  () => 'The lighthouse keeper had not seen another face in nine months, and the sea had begun to answer back.',
).join(' ');

const meta = {
  title: 'Common/ExpandableText',
  component: ExpandableText,
  args: { children: long },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '36em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExpandableText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overflowing: Story = {};
export const ThreeLines: Story = { args: { lines: 3 } };
/** No toggle when the text fits. */
export const Short: Story = { args: { children: 'A short blurb that fits.' } };
