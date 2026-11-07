import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ImageTile, ProgressBar } from '@joepittsy/ui';
import { coverUrl } from '../api/libraries';
import type { Tile } from '../api/libraries';
import styles from './BookGrid.module.css';

export interface BookTile extends Pick<Tile, 'item' | 'progress'> {
  /** Short label over the cover's top-left corner, e.g. "#2" for a series sequence. */
  badge?: string;
  /** A third muted line under the author, e.g. "Finished 3 Oct 2026". */
  meta?: string;
}

interface Props {
  tiles: BookTile[];
  /** Called when the end of the grid scrolls near the viewport. Omit when there is nothing more to load. */
  onEndReached?: () => void;
  /** Gives each tile a play button over its cover, which plays that book from where the listener left it. */
  onPlay?: (itemId: string) => void;
}

/** The library's cover grid: cover, title, author, progress, linking to the book. */
export function BookGrid({ tiles, onEndReached, onPlay }: Props) {
  const navigate = useNavigate();
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !onEndReached) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && onEndReached(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [onEndReached, tiles.length]);

  return (
    <>
      <ul className={styles.grid}>
        {tiles.map(({ item, progress, badge, meta }) => (
          <li key={item.id}>
            <ImageTile
              title={item.media.metadata.title}
              sub={item.media.metadata.authorName}
              meta={meta}
              imageUrl={coverUrl(item)}
              artFit="contain"
              href={`/book/${item.id}`}
              onOpen={() => void navigate(`/book/${item.id}`)}
              onPlay={onPlay && (() => onPlay(item.id))}
              overlay={
                <>
                  {badge && <span className={styles.badge}>{badge}</span>}
                  <ProgressBar
                    variant="overlay"
                    value={progress}
                    label={`Progress through ${item.media.metadata.title}`}
                  />
                </>
              }
            />
          </li>
        ))}
      </ul>
      {onEndReached && <div ref={sentinel} className={styles.sentinel} />}
    </>
  );
}

/** Placeholder squares in the same columns while a grid loads. */
export function BookGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={styles.grid} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton ${styles.skeleton}`} />
      ))}
    </div>
  );
}
