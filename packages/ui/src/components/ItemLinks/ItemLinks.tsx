import { Fragment } from 'react';
import styles from './ItemLinks.module.css';

/** An item title that opens it. The label carries the action: "Title, open". */
export function TitleButton({ title, onOpen, label }: { title: string; onOpen: () => void; label?: string }) {
  return (
    <button type="button" className={styles.link} aria-label={label ?? `${title}, open`} onClick={onOpen}>
      {title}
    </button>
  );
}

/** "A, B" credit string: each name is its own link. `isFirst` lets the caller use the item's primary id for the first name only. */
export function PeopleLinks({
  people,
  onOpenPerson,
}: {
  people: string;
  onOpenPerson: (name: string, isFirst: boolean) => void;
}) {
  const names = people.split(/,\s*/).filter(Boolean);
  // The comma is part of the name before it and the space after it is the only break, so a wrapped
  // credit never starts a line with ", Snoop Dogg", even when a long name wraps inside its link.
  return (
    <span className={styles.people}>
      {names.map((name, i) => (
        <Fragment key={`${name}-${i}`}>
          {i > 0 && ' '}
          <button
            type="button"
            className={styles.link}
            aria-label={`${name}, open`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenPerson(name, i === 0);
            }}
          >
            {name}
            {i < names.length - 1 && ','}
          </button>
        </Fragment>
      ))}
    </span>
  );
}
