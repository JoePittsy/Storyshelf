import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { covers } from '../../../.storybook/fixtures';
import { Artwork } from '../Artwork';
import { PillButton } from '../PillButton';
import { PlaybackRemaining, PlaybackTime, SeekBar } from '../SeekBar';
import { Sheet } from '../Sheet';
import { SkipButton } from '../SkipButton';
import { SleepTimerControl } from '../SleepTimerControl';
import type { SleepChoice, SleepValue } from '../SleepTimerControl';
import { SpeedControl } from '../SpeedControl';
import { TransportButtons } from '../TransportButtons';
import { MiniPlayer } from '../MiniPlayer';
import styles from './FullPlayerExample.module.css';

// Composition only, not an exported component: how an app lays the playback pieces out as a full-screen player
// at phone width. Previous and next move between chapters; skip moves within one. The story owns the state a
// real app would: position, rate, sleep timer, chapter.
const chapters = ['The Cutting Room', 'A Quiet Departure', 'Salt and Rope', 'What the Tide Brought', 'The Long Light'];
const CHAPTER_MS = 12 * 60000;

function FullPlayer() {
  const [index, setIndex] = useState(1);
  const [position, setPosition] = useState(4 * 60000 + 12000);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.3);
  const [sleep, setSleep] = useState<SleepValue>(null);
  const [listOpen, setListOpen] = useState(false);

  const goTo = (i: number) => {
    setIndex(i);
    setPosition(0);
  };
  const onSleep = (c: SleepChoice) =>
    setSleep(
      c === 'off' ? null : c === 'chapter' ? { kind: 'chapter' } : { kind: 'minutes', remainingMs: c.minutes * 60000 }
    );

  return (
    <div
      className="page-scale"
      style={{
        width: 390,
        minHeight: 760,
        margin: '0 auto',
        padding: '2em 1.5em calc(1.5em + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.6em',
        background: 'var(--bg)',
      }}
    >
      <div className={styles.art}>
        <Artwork src={covers.ocean} lazy={false} className={styles.img} />
      </div>
      <div>
        <h1 style={{ fontSize: 'var(--fs-title)', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
          The Salt Road
        </h1>
        <p style={{ marginTop: '0.3em', color: 'var(--text-3)', fontSize: 'var(--fs-label)' }}>
          Chapter {index + 1} · {chapters[index]}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
        <PlaybackTime ms={position} />
        <SeekBar position={position} duration={CHAPTER_MS} onSeek={setPosition} />
        <PlaybackRemaining position={position} duration={CHAPTER_MS} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SkipButton
          direction="back"
          seconds={30}
          size="lg"
          onClick={() => setPosition((p) => Math.max(0, p - 30000))}
        />
        <TransportButtons
          playing={playing}
          onPlayPause={() => setPlaying((p) => !p)}
          onPrevious={() => goTo(index - 1)}
          onNext={() => goTo(index + 1)}
          previousDisabled={index === 0}
          nextDisabled={index === chapters.length - 1}
          filled
        />
        <SkipButton
          direction="forward"
          seconds={30}
          size="lg"
          onClick={() => setPosition((p) => Math.min(CHAPTER_MS, p + 30000))}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SpeedControl value={speed} onChange={setSpeed} />
        <PillButton onClick={() => setListOpen(true)}>Chapters</PillButton>
        <SleepTimerControl value={sleep} onChange={onSleep} />
      </div>
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Chapters">
        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4em' }}>
          {chapters.map((c, i) => (
            <li key={c}>
              <PillButton
                variant={i === index ? 'primary' : 'ghost'}
                onClick={() => {
                  goTo(i);
                  setListOpen(false);
                }}
              >
                {i + 1}. {c}
              </PillButton>
            </li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}

const meta = {
  title: 'Playback/Full player example',
  component: FullPlayer,
  parameters: { frame: 'bare' },
} satisfies Meta<typeof FullPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The full-screen player at phone width. */
export const Phone: Story = {};

/** The mini player it collapses to, beneath a screen of content. */
export const WithMiniPlayer: Story = {
  render: () => (
    <div
      className="page-scale"
      style={{
        width: 390,
        height: 520,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        background: 'var(--bg)',
      }}
    >
      <MiniPlayer
        art={covers.ocean}
        title="The Salt Road"
        subtitle="Chapter 2 · A Quiet Departure"
        position={252000}
        duration={CHAPTER_MS}
        playing
        skipBackSeconds={30}
        onSkipBack={() => {}}
        onTogglePlay={() => {}}
        onOpen={() => {}}
      />
    </div>
  ),
};
