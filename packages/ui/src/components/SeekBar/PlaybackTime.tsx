import { fmtLeft } from '../../lib/fmtLeft';
import { fmtTime } from '../../lib/fmtTime';
import styles from './SeekBar.module.css';

/** A time as text ("1:29"), in tabular numerals so it doesn't jitter as it ticks. */
export function PlaybackTime({ ms, className }: { ms: number; className?: string }) {
  return <span className={[styles.time, className].filter(Boolean).join(' ')}>{fmtTime(ms)}</span>;
}

/** Time left in words ("2h 14m left", as the mini player writes it), or nothing when the duration is unknown. Decorative: the slider already announces both times. */
export function PlaybackRemaining({
  position,
  duration,
  className,
}: {
  position: number;
  duration: number;
  className?: string;
}) {
  if (duration <= 0) return null;
  return (
    <span className={[styles.time, className].filter(Boolean).join(' ')} aria-hidden="true">
      {fmtLeft(duration - position)}
    </span>
  );
}
