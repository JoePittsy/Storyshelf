import { useId, type CSSProperties } from 'react';
import { PillButton } from '../PillButton';
import styles from './FinishedCard.module.css';

interface Action {
  label: string;
  onClick: () => void;
}

interface Props {
  /** The title, and the section's accessible name. */
  title?: string;
  /** What can be said truthfully about the listen: "1h 3m over 4 days". Left out, the title stands alone. */
  detail?: string;
  /** The one way on: the inverted pill. */
  action: Action;
  /** A quieter second choice, such as listening again: a ghost pill before the action. */
  secondary?: Action;
  /** `r, g, b` of the item's own art, washed in from the top left as on UpNextCard. Falls back to the tint. */
  wash?: string | null;
  className?: string;
}

/**
 * The quiet end of an item that has nothing after it: a title ("Finished"), an honest line about the listen, and a way
 * on. UpNextCard's wall and wash, without art (the item's own cover is already on the page). Under 28em of container
 * the actions sit on a row of their own under the words; on a roomy one they sit beside them. It is a container
 * itself, sized in em. It announces nothing: the page says it once, in its own live region.
 */
export function FinishedCard({ title = 'Finished', detail, action, secondary, wash, className }: Props) {
  const id = useId();
  const style: CSSProperties | undefined = wash
    ? { background: `radial-gradient(120% 160% at 0% 0%, rgba(${wash}, 0.26), transparent 62%), var(--surface-hi)` }
    : undefined;
  return (
    <section className={[styles.root, className].filter(Boolean).join(' ')} style={style} aria-labelledby={id}>
      <div className={styles.row}>
        <div className={styles.text}>
          <h2 id={id} className={styles.title}>
            {title}
          </h2>
          {detail && <p className={styles.detail}>{detail}</p>}
        </div>
        <div className={styles.actions}>
          {secondary && (
            <PillButton className={styles.pill} onClick={secondary.onClick}>
              {secondary.label}
            </PillButton>
          )}
          <PillButton variant="primary" className={styles.pill} onClick={action.onClick}>
            {action.label}
          </PillButton>
        </div>
      </div>
    </section>
  );
}
