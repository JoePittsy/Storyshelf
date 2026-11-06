import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SegmentedControl } from '../SegmentedControl';
import { SeekBar } from './SeekBar';

type Mode = 'book' | 'chapter' | 'sleep';

// The full player's progress block in each mode: the toggle above the bar, the label under it. The window maths
// (what each mode spans) lives in the app; here the stories pass what the app would.
function Block({
  initial,
  position,
  duration,
  label,
  sleepOff,
  markers,
}: {
  initial: Mode;
  position: number;
  duration: number;
  /** Replaces the times, e.g. "Stops in 12:30". */
  label?: string;
  sleepOff?: boolean;
  markers?: { at: number; label: string }[];
}) {
  const [mode, setMode] = useState(initial);
  return (
    <div style={{ maxWidth: '32em', display: 'grid', gap: '0.6em', justifyItems: 'center' }}>
      <SegmentedControl<Mode>
        label="Progress bar shows"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'book', label: 'Book' },
          { value: 'chapter', label: 'Chapter' },
          { value: 'sleep', label: 'Sleep', disabled: sleepOff, reason: 'Set a sleep timer to use this' },
        ]}
      />
      <div style={{ width: '100%' }}>
        <SeekBar
          position={position}
          duration={duration}
          onSeek={fn()}
          readOnly={initial === 'sleep'}
          valueText={label}
          markers={markers}
          label="Progress through the book"
        />
        <div style={{ textAlign: 'center', fontSize: 'var(--fs-label)', color: 'var(--text-2)' }}>
          {label ?? 'elapsed / total'}
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: 'Playback/Progress modes',
  component: Block,
  args: { initial: 'book', position: 252000, duration: 1120000 },
} satisfies Meta<typeof Block>;
export default meta;
type Story = StoryObj<typeof meta>;

const ticks = Array.from({ length: 8 }, (_, i) => ({ at: i * 140000, label: `Chapter ${i + 1}` }));

/** Book: the whole book, with chapter ticks when there is room. */
export const BookMode: Story = { args: { markers: ticks, duration: 1120000 * 8 } };
/** Chapter: spans the current chapter (4:12 of 18:40), no ticks. */
export const ChapterMode: Story = { args: { initial: 'chapter', label: undefined } };
/** Sleep, minutes timer: from where it was set to where playback will stop; read-only. */
export const SleepMinutes: Story = { args: { initial: 'sleep', position: 300000, duration: 750000, label: 'Stops in 12:30' } };
/** Sleep, end of chapter: read-only, up to the chapter end. */
export const SleepChapterEnd: Story = { args: { initial: 'sleep', position: 540000, duration: 600000, label: 'Stops in 1:00' } };
/** No sleep timer: the Sleep option is visibly disabled and explains why. */
export const SleepDisabled: Story = { args: { sleepOff: true } };
