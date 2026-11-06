import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Settings } from 'lucide-react';
import styles from './Tabs.module.css';

export interface TabItem {
  key: string;
  label: string;
  href: string;
  /**
   * A small drawn icon that stands in for the label on a phone, where the row has no room for every word. The label stays
   * in the markup (visually hidden there), so the link keeps its name; from 30em up the icon is dropped and the word shows.
   */
  icon?: 'settings';
  /** Sits after a thin vertical divider, apart from the destinations before it (Settings, say). */
  separated?: boolean;
}

const ICONS = { settings: Settings } as const;

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
  const listRef = useRef<HTMLUListElement>(null);
  const overflowing = useOverflow(listRef);
  const click = (e: MouseEvent, href: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(href);
  };
  return (
    <nav aria-label={label} className={[styles.nav, className].filter(Boolean).join(' ')}>
      <ul ref={listRef} className={styles.list} data-overflow={overflowing || undefined}>
        {items.map((t) => {
          const Icon = t.icon && ICONS[t.icon];
          return (
          <li key={t.key} className={t.separated ? styles.separated : undefined}>
            <a
              href={t.href}
              className={`${styles.tab}${t.key === current ? ' ' + styles.on : ''}${Icon ? ' ' + styles.hasIcon : ''}`}
              aria-current={t.key === current ? 'page' : undefined}
              onClick={(e) => click(e, t.href)}
            >
              {Icon && <Icon className={styles.icon} size="1.25em" aria-hidden="true" />}
              <span className={Icon ? styles.label : undefined}>{t.label}</span>
            </a>
          </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Whether the list is wider than its box. The edge fade is a CSS mask, and iOS Safari draws a masked element inside a
 * frosted bar at low resolution (blurry text), so the mask is only applied when there is something to scroll to.
 */
function useOverflow(ref: React.RefObject<HTMLElement | null>) {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [ref]);
  return overflowing;
}
