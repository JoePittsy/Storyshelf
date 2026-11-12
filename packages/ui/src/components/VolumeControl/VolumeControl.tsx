import { useId } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { usePopoverBackToClose } from '../../hooks/useBackToClose';
import styles from '../SpeedControl/SpeedControl.module.css';

interface Props {
  /** The level, 0 to 1. */
  value: number;
  onChange: (value: number) => void;
  /** Silenced without losing the level, which the slider still shows. */
  muted?: boolean;
  onMutedChange: (muted: boolean) => void;
  className?: string;
}

const STEP = 5;
/** 0..1 to a whole percent on the slider's steps. */
const percent = (v: number) => Math.round((Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)) * 100) / STEP) * STEP;

/**
 * A speaker button that opens a popover with a volume slider and a Mute button: SpeedControl's twin, on the same
 * native popover. The speaker shows the level at a glance (crossed out when muted or at zero), and its name says it.
 * Only for where the page can set the volume: on iOS the hardware buttons own it, so don't render this there.
 */
export function VolumeControl({ value, onChange, muted = false, onMutedChange, className }: Props) {
  const id = useId();
  const back = usePopoverBackToClose();
  const level = percent(value);
  const silent = muted || level === 0;
  const text = muted ? 'Muted' : `${level}%`;
  const Icon = silent ? VolumeX : level < 50 ? Volume1 : Volume2;
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <button type="button" className={styles.trigger} popoverTarget={id} aria-label={`Volume ${text.toLowerCase()}`}>
        <Icon size="1.2em" aria-hidden="true" />
      </button>
      <div id={id} popover="auto" {...back} className={styles.pop} role="group" aria-label="Volume">
        <span className={styles.readout} aria-hidden="true">
          {text}
        </span>
        <input
          type="range"
          className={styles.slider}
          aria-label="Volume"
          min={0}
          max={100}
          step={STEP}
          value={level}
          aria-valuetext={muted ? `Muted, ${level}%` : `${level}%`}
          onChange={(e) => onChange(e.currentTarget.valueAsNumber / 100)}
        />
        <div className={styles.presets}>
          <button type="button" className={styles.preset} aria-pressed={muted} onClick={() => onMutedChange(!muted)}>
            Mute
          </button>
        </div>
      </div>
    </span>
  );
}
