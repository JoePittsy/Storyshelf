import { Airplay } from 'lucide-react';
import styles from './AirPlayButton.module.css';

interface Props {
  /** Opens the system's AirPlay picker. */
  onClick: () => void;
  /** Playback is going to an AirPlay target now: the button is lit, and says so in its description. */
  active?: boolean;
  className?: string;
}

/**
 * The AirPlay button: a quiet 44px circle with the AirPlay glyph, named "AirPlay". While playback is on an AirPlay
 * target it takes the tonal fill and full label colour. The caller shows it only when a target is available.
 */
export function AirPlayButton({ onClick, active = false, className }: Props) {
  return (
    <button
      type="button"
      className={[styles.button, active && styles.active, className].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label="AirPlay"
      title={active ? 'Playing on an AirPlay device' : 'AirPlay'}
      data-active={active || undefined}
    >
      <Airplay size="1.35em" aria-hidden="true" />
    </button>
  );
}
