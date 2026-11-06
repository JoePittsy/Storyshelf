import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { MiniPlayer } from './MiniPlayer';

// Stateless: the story passes a frozen position, and the buttons only call their handlers.
const meta = {
  title: 'Playback/MiniPlayer',
  component: MiniPlayer,
  parameters: { frame: 'bare' },
  decorators: [
    (Story) => (
      // The frame is the app's bottom slot: the page ground behind, content above the bar.
      <div
        className="page-scale"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'var(--bg)',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    art: covers.sunset,
    title: 'The Long Way to a Small, Angry Planet',
    subtitle: 'Chapter 7 · Becky Chambers',
    position: 754000,
    duration: 3600000,
    playing: true,
    skipBackSeconds: 30,
    onSkipBack: fn(),
    onTogglePlay: fn(),
    onOpen: fn(),
  },
} satisfies Meta<typeof MiniPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};
export const Paused: Story = { args: { playing: false } };
/** Loading or buffering: a spinner on the play button, which is marked aria-busy. */
export const Busy: Story = { args: { busy: true, playing: false } };
export const NoArt: Story = { args: { art: undefined } };
export const NoSubtitle: Story = { args: { subtitle: undefined } };
export const LongTitle: Story = {
  args: {
    title: 'An exceptionally long title that goes on well past the width of any phone, to prove it truncates',
    subtitle: 'A subtitle that is also far too long to fit beside the controls on a narrow screen',
  },
};
/** In a 390px phone frame, as in the app. */
export const InPhoneFrame: Story = {
  decorators: [
    (Story) => (
      <div
        style={{
          width: 390,
          height: 300,
          margin: '24px auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'var(--bg)',
          outline: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}
      >
        <Story />
      </div>
    ),
  ],
};
