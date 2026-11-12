import { Fragment, type MouseEvent } from 'react';
import styles from './ItemLinks.module.css';

/** A plain left-click is routed by the app; Ctrl/Cmd/Shift/Alt-click and middle-click are left to the browser (new tab, copy link). */
function routed(e: MouseEvent, open: () => void) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open();
}

/**
 * An item title that opens it. With `href` it is a real link named by its text: a plain click calls `onOpen` (so a router
 * navigates without a reload) and a modified or middle click opens the URL as normal. Without it, a button whose label
 * carries the action: "Title, open".
 */
export function TitleButton({
  title,
  onOpen,
  href,
  label,
}: {
  title: string;
  onOpen: () => void;
  href?: string;
  label?: string;
}) {
  if (href) {
    return (
      <a className={styles.link} href={href} aria-label={label} onClick={(e) => routed(e, onOpen)}>
        {title}
      </a>
    );
  }
  return (
    <button type="button" className={styles.link} aria-label={label ?? `${title}, open`} onClick={onOpen}>
      {title}
    </button>
  );
}

/**
 * "A, B" credit string: each name is its own link. `isFirst` lets the caller use the item's primary id for the first name
 * only. `hrefFor` gives a name its URL, which makes it a real `<a>` (a plain click still calls `onOpenPerson`; modified
 * and middle clicks open the URL); a name it returns nothing for stays a button.
 */
export function PeopleLinks({
  people,
  onOpenPerson,
  hrefFor,
}: {
  people: string;
  onOpenPerson: (name: string, isFirst: boolean) => void;
  hrefFor?: (name: string, isFirst: boolean) => string | undefined;
}) {
  const names = people.split(/,\s*/).filter(Boolean);
  // The comma is part of the name before it and the space after it is the only break, so a wrapped
  // credit never starts a line with ", Snoop Dogg", even when a long name wraps inside its link.
  return (
    <span className={styles.people}>
      {names.map((name, i) => {
        const comma = i < names.length - 1 && ',';
        const href = hrefFor?.(name, i === 0);
        const open = () => onOpenPerson(name, i === 0);
        return (
          <Fragment key={`${name}-${i}`}>
            {i > 0 && ' '}
            {href ? (
              // The comma is hidden from assistive tech so the link is named "Name", not "Name,".
              <a
                className={styles.link}
                href={href}
                onClick={(e) => {
                  e.stopPropagation();
                  routed(e, open);
                }}
              >
                {name}
                {comma && <span aria-hidden="true">{comma}</span>}
              </a>
            ) : (
              <button
                type="button"
                className={styles.link}
                aria-label={`${name}, open`}
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
              >
                {name}
                {comma}
              </button>
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
