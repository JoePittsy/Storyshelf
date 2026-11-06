import { useNavigate } from 'react-router';
import { Carousel, ImageTile, ProgressBar } from '@joepittsy/ui';
import { coverUrl } from '../api/libraries';
import type { Tile } from '../api/libraries';
import styles from './ContinueShelf.module.css';

interface Props {
  /** The books to show, most recently played first. See `continueBooks` and `splitResume`. `sub` replaces the author line. */
  tiles: (Tile & { sub?: string | null })[];
  /** Resumes the book where it was left. */
  onPlay: (itemId: string) => void;
  /** The shelf's heading. */
  title?: string;
  /** What the tile's play button does, for its name: "Resume The Hobbit". */
  playVerb?: string;
}

/**
 * "Continue listening": the unfinished books after the one the resume hero is showing. Also the Continue series shelf,
 * with its own title and verb. Renders nothing when there are none.
 */
export function ContinueShelf({ tiles, onPlay, title = 'Continue listening', playVerb = 'Resume' }: Props) {
  const navigate = useNavigate();
  if (tiles.length === 0) return null;

  return (
    <Carousel title={title} gap="1em" className={styles.shelf}>
      {tiles.map(({ item, progress: p, sub }) => (
        <div key={item.id} className={styles.tile}>
          <ImageTile
            title={item.media.metadata.title}
            sub={sub === undefined ? item.media.metadata.authorName : sub}
            imageUrl={coverUrl(item)}
            artFit="contain"
            href={`/book/${item.id}`}
            onOpen={() => void navigate(`/book/${item.id}`)}
            onPlay={() => onPlay(item.id)}
            playLabel={`${playVerb} ${item.media.metadata.title}`}
            overlay={
              <ProgressBar variant="overlay" value={p} label={`Progress through ${item.media.metadata.title}`} />
            }
          />
        </div>
      ))}
    </Carousel>
  );
}
