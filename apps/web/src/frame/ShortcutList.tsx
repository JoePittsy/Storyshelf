import styles from './ShortcutList.module.css';

/** The keys, in the order they are listed. `u` only does anything while an Undo toast shows. */
const KEYS: [keys: string, does: string][] = [
  ['Space', 'Play or pause'],
  ['Left / Right', 'Skip back / forward'],
  ['[ / ]', 'Previous / next chapter'],
  ['U', 'Undo a chapter jump'],
  ['/', 'Search the library'],
  ['?', 'Show these shortcuts'],
];

/** The keyboard shortcuts as a description list: in the shortcuts dialog and in Now Playing's hint. */
export function ShortcutList({ className }: { className?: string }) {
  return (
    <dl className={[styles.keys, className].filter(Boolean).join(' ')}>
      {KEYS.map(([keys, does]) => (
        <div key={keys} className={styles.row}>
          <dt>{keys}</dt>
          <dd>{does}</dd>
        </div>
      ))}
    </dl>
  );
}
