import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ListRow, PillButton } from '@joepittsy/ui';
import { diag, formatDiag, useDiag } from '../player/diag';
import { bootLog, checkReadiness, clearBootLog } from '../pwa/readiness';
import styles from './Debug.module.css';

/** The player's event log, newest first. Not linked from anywhere: type /debug. */
export function Debug() {
  const entries = useDiag();
  const [note, setNote] = useState('');
  const newest = [...entries].reverse();
  const [readiness, setReadiness] = useState<string[] | null>(null);
  const [boot, setBoot] = useState(() => bootLog());
  const bootText = [...boot]
    .reverse()
    .map((e) => `${e.t} ${e.ev}${e.detail === undefined ? '' : ' ' + JSON.stringify(e.detail)}`)
    .join('\n');

  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`Copied ${what}.`);
    } catch {
      setNote("Couldn't copy. Press and hold the text, or try again.");
    }
  };

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
      <section className={styles.section} aria-labelledby="readiness-title">
        <h2 id="readiness-title" className={styles.heading}>
          Offline readiness
        </h2>
        <p className={styles.note}>What the app needs to open with no network, and whether it has it.</p>
        <div className={styles.bar}>
          <PillButton onClick={() => void checkReadiness().then(setReadiness)}>Check</PillButton>
          {readiness && (
            <PillButton onClick={() => void copyText(readiness.join('\n'), 'the check')}>Copy check</PillButton>
          )}
        </div>
        {readiness && <pre className={styles.pre}>{readiness.join('\n')}</pre>}
      </section>
      <section className={styles.section} aria-labelledby="boot-title">
        <h2 id="boot-title" className={styles.heading}>
          Start-up log
        </h2>
        <p className={styles.note}>Written before the app starts, so it still has something when the app never does.</p>
        {boot.length === 0 ? (
          <p className={styles.note}>Nothing yet.</p>
        ) : (
          <>
            <div className={styles.bar}>
              <PillButton onClick={() => void copyText(bootText, 'the start-up log')}>Copy start-up log</PillButton>
              <PillButton
                onClick={() => {
                  clearBootLog();
                  setBoot([]);
                }}
              >
                Clear
              </PillButton>
            </div>
            <pre className={styles.pre}>{bootText}</pre>
          </>
        )}
      </section>
      <h2 className={styles.heading}>Player log</h2>
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
