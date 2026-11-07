import { useNavigate } from 'react-router';
import { Carousel, ImageTile, ProgressBar } from '@joepittsy/ui';
import { coverUrl } from '../api/libraries';
import type { Tile } from '../api/libraries';
import { removeMenu } from './removeMenu';
import styles from './ContinueShelf.module.css';

interface Props {
  /**
   * The books to show, most recently played first. See `continueBooks` and `splitResume`. `sub` replaces the author
   * line, `meta` adds a muted line under it ("Added 3 days ago"), and `verb` replaces `playVerb` for that tile.
   */
  tiles: (Tile & { sub?: string | null; meta?: string | null; verb?: string })[];
  /** Resumes the book where it was left. */
  onPlay: (itemId: string) => void;
  /** The shelf's heading. */
  title?: string;
  /** What each tile's play button does, for its name: "Resume The Hobbit". */
  playVerb?: string;
  /** Gives each tile a menu with Remove from Continue listening, which calls this. */
  onRemove?: (itemId: string) => void;
  /** A removal (or its Undo) is still running. */
  busy?: boolean;
}

/**
 * "Continue listening": the unfinished books after the one the resume hero is showing. Also the Continue series and
 * Recently added shelves, with their own titles and verbs. Renders nothing when there are none.
 */
export function ContinueShelf({
  tiles,
  onPlay,
  title = 'Continue listening',
  playVerb = 'Resume',
  onRemove,
  busy,
}: Props) {
  const navigate = useNavigate();
  if (tiles.length === 0) return null;

  return (
    <Carousel title={title} gap="1em" className={styles.shelf}>
      {tiles.map(({ item, progress: p, sub, meta, verb = playVerb }) => (
        <div key={item.id} className={styles.tile}>
          <ImageTile
            title={item.media.metadata.title}
            sub={sub === undefined ? item.media.metadata.authorName : sub}
            meta={meta}
            imageUrl={coverUrl(item)}
            artFit="contain"
            href={`/book/${item.id}`}
            onOpen={() => void navigate(`/book/${item.id}`)}
            onPlay={() => onPlay(item.id)}
            playLabel={`${verb} ${item.media.metadata.title}`}
            overlay={
              <ProgressBar variant="overlay" value={p} label={`Progress through ${item.media.metadata.title}`} />
            }
            menu={onRemove && removeMenu(item.id, item.media.metadata.title, onRemove, busy)}
          />
        </div>
      ))}
    </Carousel>
  );
}
