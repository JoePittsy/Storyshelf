import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, PersonLink, SearchField } from '@joepittsy/ui';
import { filterByName } from '../api/people';
import styles from './PeopleList.module.css';

export interface PersonRow {
  key: string;
  name: string;
  /** Where the avatar's initial comes from when `name` is written "Surname, First". */
  avatarName?: string;
  caption: string;
  href: string;
  imageUrl?: string;
}

interface Props {
  /** Plural noun for the search label and counts, e.g. "authors". */
  noun: string;
  rows: PersonRow[] | undefined;
  failed: boolean;
}

/** A filterable A–Z list of people: one column of rows on a phone, a grid of cards on a wide screen. */
export function PeopleList({ noun, rows, failed }: Props) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const shown = rows ? filterByName(rows, text, (r) => r.name) : [];

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <SearchField label={`Filter ${noun}`} placeholder={`Filter ${noun}`} value={text} onChange={setText} />
        {rows && (
          <p className={styles.count} aria-live="polite">
            {shown.length === rows.length ? `${rows.length} ${noun}` : `${shown.length} of ${rows.length} ${noun}`}
          </p>
        )}
      </div>
      {failed ? (
        <EmptyState title={`Can't load ${noun}`}>Check your connection and reload.</EmptyState>
      ) : !rows ? (
        <div className={styles.grid} role="status" aria-label="Loading">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`skeleton ${styles.skeleton}`} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        text.trim() ? (
          <EmptyState title="No matches">
            Nothing in {noun} matches “{text.trim()}”.
          </EmptyState>
        ) : (
          <EmptyState title={`No ${noun} yet`}>They will appear here once your books have them.</EmptyState>
        )
      ) : (
        <ul className={styles.grid}>
          {shown.map((r) => (
            <li key={r.key}>
              <PersonLink
                name={r.name}
                avatarName={r.avatarName}
                caption={r.caption}
                imageUrl={r.imageUrl}
                href={r.href}
                onOpen={() => void navigate(r.href)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
