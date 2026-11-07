import { Loader2, Play, X } from 'lucide-react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import styles from './UpNextCard.module.css';

interface Props {
  /** The next item's artwork: usually `<Artwork fit="contain" lazy={false} />`. It fills a small square frame. */
  art: ReactNode;
  title: string;
  /** Makes the title a real link (middle-click, open in new tab). A plain click calls onOpen instead of reloading. */
  href?: string;
  /** Opens the next item's own page. */
  onOpen: () => void;
  /** Where it sits: "Book 2 of Sherlock Holmes", perhaps with the time left. */
  caption?: string;
  /** The small line above the title, and the section's accessible name. */
  heading?: string;
  /** What the action does: "Play", "Resume". Spoken with the title ("Play: The Hobbit"); shown on a roomy card. */
  actionLabel?: string;
  onPlay: () => void;
  /** Loading: the action shows a spinner and is marked aria-busy. */
  busy?: boolean;
  /** Shows a close button. Leave it out for a card that stays. */
  onDismiss?: () => void;
  /** The close button's accessible name. */
  dismissLabel?: string;
  /**
   * card: a tonal wall, washed with the art's colour, for a page. bar: an opaque strip with a hairline on top, to sit
   * on the mini player, its content in the app's column (it reads `--content-max` and `--gutter` like MiniPlayer).
   */
  variant?: 'card' | 'bar';
  /** `r, g, b` of the art's dominant colour (card only). Falls back to the tint. */
  wash?: string | null;
  className?: string;
}

/**
 * What to play next, once the current item is done: the next item's art, title and place, a Play action and an
 * optional close. One row. On a narrow container (under 28em) the action is a round Play button and the words wrap;
 * on a roomy one it is a labelled pill. It is a container itself, sized in em.
 */
export function UpNextCard({
  art,
  title,
  href,
  onOpen,
  caption,
  heading = 'Up next',
  actionLabel = 'Play',
  onPlay,
  busy,
  onDismiss,
  dismissLabel = 'Dismiss',
  variant = 'card',
  wash,
  className,
}: Props) {
  const style: CSSProperties | undefined =
    variant === 'card' && wash
      ? { background: `radial-gradient(120% 160% at 0% 0%, rgba(${wash}, 0.26), transparent 62%), var(--surface-hi)` }
      : undefined;
  const onTitleClick = (e: MouseEvent) => {
    if (href) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
    onOpen();
  };
  return (
    <section
      className={[styles.root, styles[variant], className].filter(Boolean).join(' ')}
      style={style}
      aria-label={heading}
    >
      <div className={[styles.row, onDismiss && styles.closable].filter(Boolean).join(' ')}>
        <div className={styles.art}>{art}</div>
        <div className={styles.text}>
          <p className={styles.heading} aria-hidden="true">
            {heading}
          </p>
          {href ? (
            <a className={styles.title} href={href} onClick={onTitleClick} title={title}>
              {title}
            </a>
          ) : (
            <button type="button" className={styles.title} onClick={onTitleClick} title={title}>
              {title}
            </button>
          )}
          {caption && <p className={styles.caption}>{caption}</p>}
        </div>
        <button
          type="button"
          className={styles.action}
          onClick={onPlay}
          aria-label={`${actionLabel}: ${title}`}
          aria-busy={busy || undefined}
        >
          {busy ? (
            <Loader2 className={styles.spinner} size="1.1em" aria-hidden="true" />
          ) : (
            <Play size="1.1em" fill="currentColor" aria-hidden="true" />
          )}
          <span className={styles.actionText}>{actionLabel}</span>
        </button>
        {onDismiss && (
          <button type="button" className={styles.close} onClick={onDismiss} aria-label={dismissLabel}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
