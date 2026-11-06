import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlaybackTime } from '../SeekBar';
import { WavyProgress } from './WavyProgress';
import styles from './WavyProgress.module.css';

const DURATION = 222000;

// Dressed as a featured card's progress row: tabular times either side, on the lit wall.
const meta = {
  title: 'Playback/WavyProgress',
  component: WavyProgress,
  args: { position: 0.4 * DURATION, duration: DURATION, paused: false },
  argTypes: { position: { control: { type: 'range', min: 0, max: DURATION, step: 1000 } } },
  parameters: {
    docs: {
      description: {
        component:
          'Progress as a slowly travelling sine wave for the played part, then the flat track. Paused, it eases to a straight line and stops; under reduced motion it is a still, flat line.',
      },
    },
  },
  decorators: [
    (Story, { args }) => (
      <div
        style={{ maxWidth: '40em', padding: '1.4em', borderRadius: 'var(--r-card)', background: 'var(--surface-hi)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em' }}>
          <PlaybackTime ms={args.position} />
          <Story />
          <PlaybackTime ms={args.duration} />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof WavyProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

const at = (pct: number) => ({ position: Math.round((pct / 100) * DURATION) });

export const Playing: Story = {};
export const Paused: Story = { args: { paused: true } };
/** What prefers-reduced-motion shows: flat and still even while playing. */
export const ReducedMotion: Story = { args: { className: styles.reduceMotion } };
export const AtStart: Story = { args: at(0) };
/** A short flat line: the wave's height ramps up from nothing over the first wavelength. */
export const JustStarted: Story = { args: at(3) };
/** About one wavelength played: the ramp from flat to full height. */
export const OneWavelength: Story = { args: at(7) };
export const NearlyDone: Story = { args: at(97) };
export const Finished: Story = { args: at(100) };
/** No known duration: an empty track. */
export const NoDuration: Story = { args: { position: 0, duration: 0 } };
