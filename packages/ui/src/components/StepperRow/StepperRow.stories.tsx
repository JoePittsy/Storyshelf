import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { StepperRow } from './StepperRow';

// Previous, title, next on one row: step back, say where you are (and open the list), step forward.
const meta = {
  title: 'Playback/StepperRow',
  component: StepperRow,
  args: {
    title: 'The Tale of Squirrel Nutkin',
    count: '4 of 18',
    hint: '. Opens the chapter list',
    previousLabel: 'Previous chapter',
    nextLabel: 'Next chapter',
    onOpen: fn(),
    onPrevious: fn(),
    onNext: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(100%, 24em)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StepperRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** A title that is only "Chapter 6" does not repeat itself with a count. */
export const NoCount: Story = { args: { title: 'Chapter 6', count: undefined } };
export const LongTitle: Story = {
  args: { title: 'A very long chapter title that has to be cut off before it pushes the buttons away' },
};
export const LastChapter: Story = { args: { nextDisabled: true } };
