import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import styles from './ExpandableText.module.css';

interface Props {
  children: ReactNode;
  /** Lines shown while collapsed. Default 6. */
  lines?: number;
  className?: string;
}

/** Text clamped to a few lines, with a "Show more" toggle that appears only when the text overflows. */
export function ExpandableText({ children, lines = 6, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Measure only while collapsed: once expanded there is nothing clamped to compare against.
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, children, lines]);

  return (
    <div className={className}>
      <div
        ref={ref}
        id={id}
        className={`${styles.text}${expanded ? '' : ' ' + styles.clamped}`}
        style={{ '--lines': lines } as CSSProperties}
      >
        {children}
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
