import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ListRow, PillButton } from '@joepittsy/ui';
import { diag, formatDiag, useDiag } from '../player/diag';
import styles from './Debug.module.css';

/** The player's event log, newest first. Not linked from anywhere: type /debug. */
export function Debug() {
  const entries = useDiag();
  const [note, setNote] = useState('');
  const newest = [...entries].reverse();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatDiag(entries));
      setNote(`Copied ${entries.length} entries.`);
    } catch {
      setNote("Couldn't copy. Press and hold a row, or try again.");
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Player log</h1>
      <Link to="/debug/storage" className={styles.link}>
        Storage test
      </Link>
      <div className={styles.bar}>
        <PillButton variant="primary" onClick={() => void copy()}>
          Copy log
        </PillButton>
        <PillButton
          onClick={() => {
            diag.clear();
            setNote('Cleared.');
          }}
        >
          Clear
        </PillButton>
      </div>
      <p className={styles.note} role="status">
        {note}
      </p>
      {newest.length === 0 ? (
        <EmptyState title="Nothing logged yet">Play something, then come back.</EmptyState>
      ) : (
        <ul className={styles.list}>
          {newest.map((e, i) => (
            <ListRow
              key={`${e.t}-${newest.length - i}`}
              lead={e.t.slice(11, 19)}
              title={e.detail === undefined ? e.ev : `${e.ev} ${JSON.stringify(e.detail)}`}
              onClick={() => void navigator.clipboard?.writeText(`${e.t} ${e.ev} ${JSON.stringify(e.detail ?? '')}`)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
