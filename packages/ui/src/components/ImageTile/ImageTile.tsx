import { Play } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { AddButton } from '../AddButton';
import { Artwork } from '../Artwork';
import styles from './ImageTile.module.css';

interface Props {
  title: string;
  sub?: string | null;
  /** A third muted line, e.g. when it was played. */
  meta?: string | null;
  imageUrl?: string | null;
  /** Circles for people; squares for everything else. */
  circular?: boolean;
  /** `cover` crops the art to the square (default); `contain` shows a whole cover over a blurred copy of itself. */
  artFit?: 'cover' | 'contain';
  /** md: roomy shelf tile. sm: compact tile for three-up groups. */
  size?: 'md' | 'sm';
  onOpen: () => void;
  /** Renders a real link (middle-click, open in new tab). A plain click calls onOpen instead of reloading. */
  href?: string;
  /** Drawn over the bottom of the art, e.g. a ProgressBar overlay. */
  overlay?: ReactNode;
  /** Hover prefetch. */
  onHover?: () => void;
  /** Adds a + on the art's top-right corner, revealed on hover or focus. It never opens the tile. */
  onAdd?: () => void;
  addLabel?: string;
  /** Adds a round play button over the art's bottom-right corner, always visible. It never opens the tile. */
  onPlay?: () => void;
  playLabel?: string;
}

/** Artwork over a caption. The tile rises 2px on hover or focus and its art picks up the lifted shadow. */
export function ImageTile({
  title,
  sub,
  meta,
  imageUrl,
  circular,
  artFit = 'cover',
  size = 'md',
  onOpen,
  href,
  overlay,
  onHover,
  onAdd,
  addLabel,
  onPlay,
  playLabel,
}: Props) {
  const Main = href ? 'a' : 'button';
  const mainProps = href
    ? {
        href,
        onClick: (e: MouseEvent) => {
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onOpen();
        },
      }
    : { type: 'button' as const, onClick: onOpen };
  return (
    <div className={`${styles.tile} ${size === 'sm' ? styles.sm : styles.md}`} onMouseEnter={onHover}>
      <Main className={styles.main} {...mainProps}>
        <span className={`${styles.art} ${circular ? styles.round : ''}`} aria-hidden="true">
          <Artwork src={imageUrl} fit={artFit} placeholderClassName={styles.ph} />
          {overlay}
        </span>
        {/* The lines are stacked blocks; read as one name, "Title" and "Author" would run together, so each line ends in a
            hidden comma. */}
        <span className={styles.title} title={title}>
          {title}
          {(sub || meta) && <span className={styles.sep}>,</span>}
        </span>
        {sub && (
          <span className={styles.sub} title={sub}>
            {sub}
            {meta && <span className={styles.sep}>,</span>}
          </span>
        )}
        {meta && (
          <span className={styles.sub} title={meta}>
            {meta}
          </span>
        )}
      </Main>
      {onAdd && (
        <AddButton variant="corner" className={styles.add} label={addLabel ?? `Add ${title}`} onClick={onAdd} />
      )}
      {onPlay && (
        <span className={styles.playSlot}>
          <button
            type="button"
            className={styles.play}
            aria-label={playLabel ?? `Play ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            <Play size={18} fill="currentColor" aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}
