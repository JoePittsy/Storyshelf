import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { SegmentedControl } from '../SegmentedControl';
import { MiniPlayer } from './MiniPlayer';

// Stateless: the story passes a frozen position, and the buttons only call their handlers.
const meta = {
  title: 'Playback/MiniPlayer',
  component: MiniPlayer,
  parameters: { frame: 'bare' },
  args: {
    art: covers.sunset,
    title: 'The Long Way to a Small, Angry Planet',
    subtitle: 'Chapter 7: The Hollow',
    author: 'Becky Chambers',
    position: 754000,
    duration: 3600000,
    playing: true,
    skipBackSeconds: 30,
    onSkipBack: fn(),
    onTogglePlay: fn(),
    onOpen: fn(),
    onSeek: fn(),
    onPrevious: fn(),
    onNext: fn(),
    onSkipForward: fn(),
    rate: 1,
    onRateChange: fn(),
    sleep: null,
    onSleepChange: fn(),
    onChapters: fn(),
    onExpand: fn(),
  },
} satisfies Meta<typeof MiniPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

const HOUR = 3600000;
const chapters = (n: number, duration = HOUR) =>
  Array.from({ length: n }, (_, i) => ({ at: i * (duration / n), label: `Chapter ${i + 1}: Title ${i + 1}` }));

/** The frame is the app's bottom slot: the page ground behind, the bar at the bottom, at a fixed width. */
const frame = (width: number) => [
  (Story: () => React.JSX.Element) => (
    <div className="page-scale" style={{ background: 'var(--bg)' }}>
      <div
        style={{
          width,
          maxWidth: '100%',
          height: 320,
          margin: '24px auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'var(--bg)',
          outline: '1px solid var(--border)',
        }}
      >
        <Story />
      </div>
    </div>
  ),
];
const book = { duration: 13 * HOUR + 41 * 60000 + 20000, position: 1 * HOUR + 54 * 60000 + 57000 };
const short = { title: 'Mythos', subtitle: 'Chapter 7', author: 'Stephen Fry' };
const long = {
  title: 'An exceptionally long title that goes on well past the width of any phone, to prove it truncates',
  subtitle: 'A chapter title that is also far too long to fit beside the controls on a narrow screen',
  author: 'An Author With A Very Long Name, Another Author, And A Third One Besides',
};

const modeControl = (value: 'book' | 'chapter' | 'sleep', sleepOff = false) => (
  <SegmentedControl<'book' | 'chapter' | 'sleep'>
    label="Progress bar shows"
    value={value}
    onChange={fn()}
    options={[
      { value: 'book', label: 'Book' },
      { value: 'chapter', label: 'Chapter' },
      { value: 'sleep', label: 'Sleep', disabled: sleepOff, reason: 'Set a sleep timer to use this' },
    ]}
  />
);

/** Book mode (the default) with the mode toggle in the right-hand zone. */
export const BookMode: Story = { args: { markers: chapters(12), modeControl: modeControl('book', true) }, decorators: frame(1440) };
/** Chapter mode: the bar spans the chapter (4:12 / 18:40), no ticks. */
export const ChapterMode: Story = {
  args: { position: 252000, duration: 1120000, modeControl: modeControl('chapter', true) },
  decorators: frame(1440),
};
/** Sleep, minutes timer: from where it was set to where playback stops. Passive: not seekable. */
export const SleepMinutes: Story = {
  args: { position: 300000, duration: 750000, onSeek: undefined, timeLabel: 'Stops in 12:30', modeControl: modeControl('sleep') },
  decorators: frame(1440),
};
/** Sleep, end of chapter. */
export const SleepChapterEnd: Story = {
  args: { position: 540000, duration: 600000, onSeek: undefined, timeLabel: 'Stops in 1:00', modeControl: modeControl('sleep') },
  decorators: frame(1440),
};
/** No sleep timer: the Sleep option is visibly disabled with its reason. */
export const SleepDisabled: Story = {
  args: { markers: chapters(12), modeControl: modeControl('book', true) },
  decorators: frame(1440),
};

/** 1440px, 12 chapters: ticks drawn; three zones, the controls centred. */
export const Desktop1440: Story = { args: { markers: chapters(12) }, decorators: frame(1440) };
/** 150 chapters: too dense for ticks, so none are drawn. The preview still names the chapter (held open here). */
export const Desktop1440ManyChapters: Story = {
  args: { markers: chapters(150), previewAt: 1860000 },
  decorators: frame(1440),
};
/** A short title: the left zone is content-sized, so there is no dead gap before the controls. */
export const Desktop1440ShortTitle: Story = { args: { markers: chapters(12), modeControl: modeControl('book', true), ...short }, decorators: frame(1440) };
/** About 1870px wide, as on a large monitor. */
export const Desktop1870: Story = { args: { markers: chapters(12) }, decorators: frame(1870) };
export const Desktop1870ShortTitle: Story = { args: { markers: chapters(150), ...short }, decorators: frame(1870) };
/** A book over 10 hours: the times show hours (1:54:57 / 13:41:20). */
export const TenHourBook: Story = {
  args: { ...book, markers: chapters(120, book.duration), ...short },
  decorators: frame(1440),
};
export const TenHourBookPhone: Story = {
  args: { ...book, markers: chapters(12, book.duration) },
  decorators: frame(375),
};
/** Long title, chapter and author truncate with an ellipsis. */
export const LongTitles: Story = { args: { markers: chapters(12), ...long }, decorators: frame(1440) };
export const LongTitlesPhone: Story = { args: { markers: chapters(12), ...long }, decorators: frame(375) };
/** Phone: the seek line spans the top edge, no times; speed, sleep and chapters live in the full player. */
export const Phone375: Story = { args: { markers: chapters(12) }, decorators: frame(375) };
export const Phone375ManyChapters: Story = {
  args: { markers: chapters(150), previewAt: 1860000 },
  decorators: frame(375),
};
export const Paused: Story = { args: { playing: false, markers: chapters(12) }, decorators: frame(1440) };
/** Loading or buffering: a spinner on the play button, which is marked aria-busy. */
export const Busy: Story = { args: { busy: true, playing: false, markers: chapters(12) }, decorators: frame(1440) };
export const NoArt: Story = { args: { art: undefined, markers: chapters(12) }, decorators: frame(1440) };
/** The preview held open at 31:00, clamped inside the bar. */
export const PreviewOpen: Story = { args: { markers: chapters(12), previewAt: 1860000 }, decorators: frame(1440) };
/** Under prefers-reduced-transparency the bar is the same: it is already an opaque surface. */
export const ReducedTransparency: Story = {
  args: { markers: chapters(12) },
  decorators: [
    (Story) => (
      <div style={{ '--material-bg': 'var(--bg-1)', '--material-filter': 'none' } as React.CSSProperties}>
        <Story />
      </div>
    ),
    ...frame(1440),
  ],
};
/** Passive line (no onSeek, no extras) at phone width. */
export const Passive: Story = {
  args: {
    onSeek: undefined,
    onSkipForward: undefined,
    onPrevious: undefined,
    onNext: undefined,
    rate: undefined,
    onChapters: undefined,
    onExpand: undefined,
  },
  decorators: frame(375),
};
