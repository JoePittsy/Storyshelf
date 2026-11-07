import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CarPlayer } from './CarPlayer';

// Stateless: the story passes frozen values, and the buttons only call their handlers. It fills the viewport, so
// resize the canvas (or turn a device on its side) to see the landscape layout.
const meta = {
  title: 'Playback/CarPlayer',
  component: CarPlayer,
  parameters: { frame: 'bare' },
  decorators: [
    (Story) => (
      <div className="page-scale">
        <Story />
      </div>
    ),
  ],
  args: {
    chapter: 'Chapter 7: The adventure of the blue carbuncle',
    timeLeft: '12:34',
    timeLeftOf: 'chapter',
    progress: 0.42,
    playing: true,
    skipBackSeconds: 15,
    skipForwardSeconds: 30,
    onPlayPause: fn(),
    onSkipBack: fn(),
    onSkipForward: fn(),
    onPreviousChapter: fn(),
    onNextChapter: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof CarPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};
export const Paused: Story = { args: { playing: false } };
/** Just after a chapter jump: the way back is a big button opposite Close. */
export const WithUndo: Story = { args: { undo: { label: 'Undo', onUndo: fn() } } };
/** A book with no chapters: no chapter line or chapter buttons, and the time counts to the end of the book. */
export const NoChapters: Story = {
  args: {
    chapter: null,
    timeLeft: '2:41:07',
    timeLeftOf: 'book',
    onPreviousChapter: undefined,
    onNextChapter: undefined,
  },
};
/** The last chapter: Next is disabled. */
export const LastChapter: Story = { args: { nextDisabled: true } };
export const Loading: Story = { args: { busy: true, playing: false } };
