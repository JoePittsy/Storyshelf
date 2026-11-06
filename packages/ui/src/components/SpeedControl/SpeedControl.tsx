import { useId } from 'react';
import { Gauge } from 'lucide-react';
import { fmtSpeed, snapSpeed } from '../../lib/snapSpeed';
import styles from './SpeedControl.module.css';

interface Props {
  /** Playback rate, 1 = normal. */
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Quick picks under the slider. */
  presets?: number[];
  /** Always one decimal on the button ("1.0×"), so its width holds as the rate changes. */
  fixedDecimal?: boolean;
  className?: string;
}

/**
 * A button showing the rate ("1.3×") that opens a popover with a range slider and preset buttons. The popover is
 * native (popover attribute): it light-dismisses, closes on Esc, returns focus to the button and sits in the top
 * layer. Every value passed to onChange is clamped to min..max and rounded to the step.
 */
export function SpeedControl({
  value,
  onChange,
  min = 0.5,
  max = 3,
  step = 0.1,
  presets = [0.8, 1, 1.2, 1.5, 2],
  fixedDecimal,
  className,
}: Props) {
  const id = useId();
  const current = snapSpeed(value, min, max, step);
  const text = `${fixedDecimal ? current.toFixed(1) : fmtSpeed(current)}×`;
  const set = (v: number) => onChange(snapSpeed(v, min, max, step));
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <button type="button" className={styles.trigger} popoverTarget={id} aria-label={`Playback speed ${text}`}>
        <Gauge size="1.2em" aria-hidden="true" />
        <span aria-hidden="true">{text}</span>
      </button>
      <div id={id} popover="auto" className={styles.pop} role="group" aria-label="Playback speed">
        <span className={styles.readout} aria-hidden="true">
          {text}
        </span>
        <input
          type="range"
          className={styles.slider}
          aria-label="Speed"
          min={min}
          max={max}
          step={step}
          value={current}
          aria-valuetext={text}
          onChange={(e) => set(e.currentTarget.valueAsNumber)}
        />
        <div className={styles.presets}>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={styles.preset}
              aria-pressed={snapSpeed(p, min, max, step) === current}
              onClick={() => set(p)}
            >
              {fmtSpeed(p)}×
            </button>
          ))}
        </div>
      </div>
    </span>
  );
}
