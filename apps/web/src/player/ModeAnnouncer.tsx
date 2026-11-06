import styles from './ModeAnnouncer.module.css';

/** Says the new progress mode to a screen reader after a tap on the bar (the visible line is aria-hidden). */
export function ModeAnnouncer({ text }: { text: string | undefined }) {
  return (
    <p className={styles.sr} role="status" aria-live="polite">
      {text ? `Progress bar shows: ${text}` : ''}
    </p>
  );
}
