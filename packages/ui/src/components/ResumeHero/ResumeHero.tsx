import { Loader2, Pause, Play } from 'lucide-react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { ProgressBar } from '../ProgressBar';
import styles from './ResumeHero.module.css';

interface Props {
  /** The artwork: usually `<Artwork fit="contain" lazy={false} />`. It fills a square, clipped frame. */
  art: ReactNode;
  title: string;
  /** Makes the title a real link (middle-click, open in new tab). A plain click calls onOpen instead of reloading. */
  href?: string;
  /** Opens the media's own page. */
  onOpen: () => void;
  /** Under the title: who made it. */
  sub?: string | null;
  /** Where you are, in human terms: "Chapter 3 of 12 · 4h 12m left". */
  status?: string;
  /** 0 to 1. */
  progress: number;
  /** The progress bar's accessible name. */
  progressLabel: string;
  /** True while it is playing: the action reads Pause. */
  playing?: boolean;
  /** Loading or buffering: the action shows a spinner and is marked aria-busy. */
  busy?: boolean;
  /** The action's label. Defaults to Pause while playing, Resume otherwise. */
  actionLabel?: string;
  /** Resume or pause. */
  onAction: () => void;
  /** `r, g, b` of the artwork's dominant colour, washed in from the top left. Falls back to the tint. */
  wash?: string | null;
  /** Secondary actions beside the main one, usually a `<MoreMenu />`. */
  menu?: ReactNode;
  /** The section's accessible name. */
  label?: string;
  className?: string;
}

/**
 * The one thing to carry on with: a full-width band with the artwork, where you are, a progress bar and a large
 * primary action. The artwork's colour washes the wall. Stacks on a narrow container (art and text on a row, the
 * action full width beneath) and spreads into one row on a wide one. Sized in em, and a container itself.
 */
export function ResumeHero({
  art,
  title,
  href,
  onOpen,
  sub,
  status,
  progress,
  progressLabel,
  playing = false,
  busy,
  actionLabel,
  onAction,
  wash,
  menu,
  label = 'Resume listening',
  className,
}: Props) {
  const style: CSSProperties | undefined = wash
    ? { background: `radial-gradient(120% 160% at 0% 0%, rgba(${wash}, 0.3), transparent 65%), var(--surface-hi)` }
    : undefined;
  const text = actionLabel ?? (playing ? 'Pause' : 'Resume');
  const onTitleClick = (e: MouseEvent) => {
    if (href) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
    onOpen();
  };
  return (
    <section
      className={[styles.hero, menu && styles.hasMenu, className].filter(Boolean).join(' ')}
      style={style}
      aria-label={label}
    >
      <div className={styles.art}>{art}</div>
      <div className={styles.text}>
        {href ? (
          <a className={styles.title} href={href} onClick={onTitleClick} title={title}>
            {title}
          </a>
        ) : (
          <button type="button" className={styles.title} onClick={onTitleClick} title={title}>
            {title}
          </button>
        )}
        {sub && <p className={styles.sub}>{sub}</p>}
        {status && <p className={styles.status}>{status}</p>}
      </div>
      <ProgressBar className={styles.bar} value={progress} label={progressLabel} showEmpty />
      <button
        type="button"
        className={styles.action}
        onClick={onAction}
        aria-label={`${text}: ${title}`}
        aria-busy={busy || undefined}
      >
        {busy ? (
          <Loader2 className={styles.spinner} size="1.1em" aria-hidden="true" />
        ) : playing ? (
          <Pause size="1.1em" fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size="1.1em" fill="currentColor" aria-hidden="true" />
        )}
        <span>{text}</span>
      </button>
      {menu && <div className={styles.menu}>{menu}</div>}
    </section>
  );
}
