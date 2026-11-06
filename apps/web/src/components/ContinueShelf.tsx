import { useNavigate } from 'react-router';
import { Carousel, ImageTile, ProgressBar } from '@joepittsy/ui';
import { coverUrl } from '../api/libraries';
import type { Tile } from '../api/libraries';
import styles from './ContinueShelf.module.css';

interface Props {
  /** The books to show, most recently played first. See `continueBooks` and `splitResume`. */
  tiles: Tile[];
  /** Resumes the book where it was left. */
  onPlay: (itemId: string) => void;
}

/** "Continue listening": the unfinished books after the one the resume hero is showing. Renders nothing when there are none. */
export function ContinueShelf({ tiles, onPlay }: Props) {
  const navigate = useNavigate();
  if (tiles.length === 0) return null;

  return (
    <Carousel title="Continue listening" gap="1em" className={styles.shelf}>
      {tiles.map(({ item, progress: p }) => (
        <div key={item.id} className={styles.tile}>
          <ImageTile
            title={item.media.metadata.title}
            sub={item.media.metadata.authorName}
            imageUrl={coverUrl(item)}
            artFit="contain"
            href={`/book/${item.id}`}
            onOpen={() => void navigate(`/book/${item.id}`)}
            onPlay={() => onPlay(item.id)}
            playLabel={`Resume ${item.media.metadata.title}`}
            overlay={
              <ProgressBar variant="overlay" value={p} label={`Progress through ${item.media.metadata.title}`} />
            }
          />
        </div>
      ))}
    </Carousel>
  );
}
