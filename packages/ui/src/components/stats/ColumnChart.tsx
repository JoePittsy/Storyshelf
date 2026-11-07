import { useRef, useState } from 'react';
import { ChartTooltip, TipRow, TipTitle } from './ChartTooltip';
import type { Tip } from './ChartTooltip';
import styles from './ColumnChart.module.css';

/** About the readout's width (ChartTooltip's 11em minimum), for placing it clear of the column. */
const TIP_WIDTH = 170;

export interface Column {
  key: string;
  /** Under the column ("Jan"). */
  label: string;
  /** A shorter label for a narrow chart ("J"); the label is used when left out. */
  short?: string;
  /** In the tooltip and the table ("January"). */
  name: string;
  value: number;
  /** The value, formatted ("6h 40m"). */
  valueLabel: string;
}

interface Props {
  columns: Column[];
  /** The chart's accessible name: what it shows, and the headline ("Time listened each month of 2026. Most in March"). */
  label: string;
  /** Column headings for the table: the category and the value ("Month", "Listened"). */
  nameHeading: string;
  valueHeading: string;
  /** The disclosure that opens the table. */
  tableLabel?: string;
  className?: string;
}

/**
 * One series of vertical columns over time or another ordered scale: thin columns with rounded tops on one baseline, a
 * label on the tallest one only, the rest in a hover readout and in a table behind a disclosure (the chart's text
 * alternative). A column at zero draws nothing, so an empty month reads as empty. Sized in em: inside a .page-scale
 * root. Under 30em of container the labels shorten.
 */
export function ColumnChart({ columns, label, nameHeading, valueHeading, tableLabel = 'Show as a table', className }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const frame = useRef<HTMLElement>(null);
  const max = Math.max(0, ...columns.map((c) => c.value));
  const top = max > 0 ? columns.findIndex((c) => c.value === max) : -1;

  const show = (e: React.PointerEvent, c: Column) => {
    const box = frame.current?.getBoundingClientRect();
    const slot = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!box) return;
    // Beside the column, never over it: to its right, or to its left near the right edge.
    const right = slot.right - box.left + 6;
    setTip({
      x: right + TIP_WIDTH <= box.width ? right : Math.max(0, slot.left - box.left - TIP_WIDTH - 6),
      y: slot.top - box.top,
      content: (
        <>
          <TipTitle>{c.name}</TipTitle>
          <TipRow name={valueHeading} value={c.valueLabel} />
        </>
      ),
    });
  };

  return (
    <figure ref={frame} className={[styles.frame, className].filter(Boolean).join(' ')} onPointerLeave={() => setTip(null)}>
      <div className={styles.plot} role="img" aria-label={label} style={{ '--cols': columns.length } as React.CSSProperties}>
        {columns.map((c, i) => (
          <div key={c.key} className={styles.slot} onPointerEnter={(e) => show(e, c)}>
            {i === top && (
              <span className={styles.cap} aria-hidden="true">
                {c.valueLabel}
              </span>
            )}
            {c.value > 0 && <span className={styles.bar} style={{ height: `${(c.value / max) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className={styles.axis} aria-hidden="true" style={{ '--cols': columns.length } as React.CSSProperties}>
        {columns.map((c) => (
          <span key={c.key} className={styles.tick}>
            <span className={styles.long}>{c.label}</span>
            <span className={styles.short}>{c.short ?? c.label}</span>
          </span>
        ))}
      </div>
      <details className={styles.details}>
        <summary className={styles.summary}>{tableLabel}</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{nameHeading}</th>
              <th scope="col">{valueHeading}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key}>
                <th scope="row">{c.name}</th>
                <td>{c.valueLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <ChartTooltip tip={tip} />
    </figure>
  );
}
