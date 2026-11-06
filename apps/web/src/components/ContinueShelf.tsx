import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Carousel, ImageTile, ProgressBar } from '@joepittsy/ui';
import { useInProgress } from '../api/history';
import { coverUrl, mergeProgress, useProgress } from '../api/libraries';
import styles from './ContinueShelf.module.css';

interface Props {
  libraryId: string;
  /** Resumes the book where it was left. */
  onPlay: (itemId: string) => void;
}

/** "Continue listening": this library's unfinished books, most recently played first. Renders nothing when there are none. */
export function ContinueShelf({ libraryId, onPlay }: Props) {
  const navigate = useNavigate();
  const inProgress = useInProgress();
  const progress = useProgress();

  const tiles = useMemo(() => {
    const map = progress.data ?? new Map();
    // ABS lists hidden ones too, and other libraries'; a book it can't show a cover for is still a book.
    const items = (inProgress.data ?? []).filter(
      (i) => i.mediaType === 'book' && i.libraryId === libraryId && !map.get(i.id)?.hidden,
    );
    return mergeProgress(items, map);
  }, [inProgress.data, progress.data, libraryId]);

  if (tiles.length === 0) return null;

  return (
    <Carousel title="Continue listening" gap="1em" className={styles.shelf}>
      {tiles.map(({ item, progress: p }) => (
        <div key={item.id} className={styles.tile}>
          <ImageTile
            title={item.media.metadata.title}
            sub={item.media.metadata.authorName}
            imageUrl={coverUrl(item)}
            href={`/book/${item.id}`}
            onOpen={() => void navigate(`/book/${item.id}`)}
            onPlay={() => onPlay(item.id)}
            playLabel={`Resume ${item.media.metadata.title}`}
            overlay={<ProgressBar variant="overlay" value={p} label={`Progress through ${item.media.metadata.title}`} />}
          />
        </div>
      ))}
    </Carousel>
  );
}
