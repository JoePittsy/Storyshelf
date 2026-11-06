import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { SeekMarker } from '../../lib/seekMarkers';
import { PlaybackRemaining, PlaybackTime } from './PlaybackTime';
import { SeekBar } from './SeekBar';

const DURATION = 222000;

// Dressed as a progress row: the times either side. The story owns the playhead, as an app would: a click or an
// arrow key calls onSeek (logged in the Actions panel) and moves it.
function Row({
  position: initial,
  duration,
  markers,
  previewAt,
  slim,
  onSeek,
}: {
  position: number;
  duration: number;
  markers?: SeekMarker[];
  previewAt?: number;
  slim?: boolean;
  onSeek: (ms: number) => void;
}) {
  const [position, setPosition] = useState(initial);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', maxWidth: '40em' }}>
      <PlaybackTime ms={position} />
      <SeekBar
        position={position}
        duration={duration}
        markers={markers}
        previewAt={previewAt}
        slim={slim}
        onSeek={(ms) => {
          setPosition(ms);
          onSeek(ms);
        }}
      />
      {duration > 0 ? <PlaybackTime ms={duration} /> : null}
      <PlaybackRemaining position={position} duration={duration} />
    </div>
  );
}

const meta = {
  title: 'Playback/SeekBar',
  component: Row,
  args: { position: 89000, duration: DURATION, onSeek: fn() },
  argTypes: { position: { control: { type: 'range', min: 0, max: DURATION, step: 1000 } } },
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AtStart: Story = { args: { position: 0 } };
export const NearlyDone: Story = { args: { position: 215000 } };
/** No known duration (nothing loaded): the bar is disabled and does nothing when pressed. */
export const NoDuration: Story = { args: { position: 0, duration: 0 } };
const chapters = (n: number): SeekMarker[] =>
  Array.from({ length: n }, (_, i) => ({ at: i * (DURATION / n), label: `Chapter ${i + 1}: Title ${i + 1}` }));

/** Chapter starts as ticks. Hover the bar for the time and chapter; the next story holds that preview open. */
export const WithChapterTicks: Story = { args: { markers: chapters(12) } };
/** The hover preview held open at 1:30, as it looks under a pointer or a dragging finger. */
export const PreviewOpen: Story = { args: { markers: chapters(12), previewAt: 90000 } };
/** The same, in the slim track the mini player uses: chapter 5 (1:30) white and lifted. */
export const PreviewOpenSlim: Story = { args: { markers: chapters(12), previewAt: 90000, slim: true } };
/** A long book: 64 chapters do not fit this bar at 10px each, so no ticks are drawn. */
export const ManyChapterTicks: Story = { args: { markers: chapters(64) } };
