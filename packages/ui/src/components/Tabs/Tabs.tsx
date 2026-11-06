import type { MouseEvent } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  key: string;
  label: string;
  href: string;
}

interface Props {
  /** The accessible name of the nav landmark, e.g. "Library sections". */
  label: string;
  items: TabItem[];
  /** The `key` of the tab for the page being shown. */
  current: string;
  /** Called on a plain click, so a router can navigate without a reload. Modified clicks open the link as normal. */
  onNavigate: (href: string) => void;
  className?: string;
}

/** Navigation tabs: real links, the current one marked `aria-current="page"`. Scrolls sideways when it can't fit. */
export function Tabs({ label, items, current, onNavigate, className }: Props) {
  const click = (e: MouseEvent, href: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(href);
  };
  return (
    <nav aria-label={label} className={[styles.nav, className].filter(Boolean).join(' ')}>
      <ul className={styles.list}>
        {items.map((t) => (
          <li key={t.key}>
            <a
              href={t.href}
              className={`${styles.tab}${t.key === current ? ' ' + styles.on : ''}`}
              aria-current={t.key === current ? 'page' : undefined}
              onClick={(e) => click(e, t.href)}
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
