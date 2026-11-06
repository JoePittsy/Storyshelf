import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TransportButtons } from './TransportButtons';

// Previous / play-pause / next. Stateless: pressing one only calls the handler (logged in the Actions panel).
const meta = {
  title: 'Playback/TransportButtons',
  component: TransportButtons,
  args: { playing: false, onPlayPause: fn(), onPrevious: fn(), onNext: fn() },
} satisfies Meta<typeof TransportButtons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Playing: Story = { args: { playing: true } };
/** Nothing loaded: all three are disabled. */
export const Disabled: Story = { args: { disabled: true } };
/** First in the list: Previous is disabled. */
export const AtStart: Story = { args: { previousDisabled: true } };
/** No handler for Next: it is disabled. */
export const NoNext: Story = { args: { onNext: undefined } };
/** Solid glyphs. */
export const Filled: Story = { args: { filled: true } };
export const FilledPlaying: Story = { args: { filled: true, playing: true } };
