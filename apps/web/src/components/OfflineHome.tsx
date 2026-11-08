import { useNavigate } from 'react-router';
import { Download } from 'lucide-react';
import { Artwork, EmptyState, ItemRow, PillButton, ResumeHero, useDominantColor } from '@joepittsy/ui';
import { useProgress } from '../api/libraries';
import { useDownloads, type DownloadedBook } from '../downloads';
import { usePlayer } from '../player/engine';
import { placeOf } from '../player/places';
import { downloadLine, jumpBackIn, withPlacesHere } from './offlineHome';
import { resumeLabel, resumeStatus } from './resume';
import styles from './OfflineHome.module.css';

interface Props {
  /** Starts or resumes a book where it was left. */
  onPlay: (itemId: string) => void;
}

/**
 * The library while offline: only what can be listened to with no connection. A book to jump back in to (the last
 * listened of those on the device), then every download.
 */
export function OfflineHome({ onPlay }: Props) {
  const navigate = useNavigate();
  const downloads = useDownloads();
  const progress = useProgress();
  const player = usePlayer();
  const places = withPlacesHere(progress.data ?? new Map(), downloads, placeOf);
  const hero = jumpBackIn(downloads, places, player.item?.id);

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Library</h1>
      {hero && (
        <Hero key={hero.itemId} book={hero} lastPlace={places.get(hero.itemId)?.currentTime ?? 0} onPlay={onPlay} />
      )}
      <section className={styles.section} aria-labelledby="downloads-heading">
        <h2 id="downloads-heading" className={styles.heading}>
          Downloads
        </h2>
        {downloads.length === 0 ? (
          <EmptyState icon={Download} title="No downloads yet">
            While you&apos;re online, download a book from its page to listen to it here with no connection.
          </EmptyState>
        ) : (
          <ul className={styles.list}>
            {downloads.map((d) => (
              <ItemRow
                key={d.itemId}
                title={d.title}
                reason={`${d.author} · ${downloadLine(d)}`}
                imageUrl={d.coverUrl}
                artFit="contain"
                onOpen={() => void navigate(`/book/${d.itemId}`)}
                trailing={
                  d.status === 'complete' ? (
                    <PillButton icon="play" aria-label={`Play ${d.title}`} onClick={() => onPlay(d.itemId)}>
                      Play
                    </PillButton>
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** The download to carry on with, from the player's live place when it has the book, else the place last kept here. */
function Hero({
  book,
  lastPlace,
  onPlay,
}: {
  book: DownloadedBook;
  lastPlace: number;
  onPlay: (itemId: string) => void;
}) {
  const navigate = useNavigate();
  const player = usePlayer();
  const wash = useDominantColor(book.coverUrl);
  const here = player.item?.id === book.itemId && player.duration > 0;
  const duration = here ? player.duration : book.duration;
  const currentTime = here ? player.position : lastPlace;
  const playing = here && player.status === 'playing';
  const open = () => void navigate(`/book/${book.itemId}`);

  return (
    <ResumeHero
      label="Jump back in"
      art={<Artwork src={book.coverUrl} fit="contain" lazy={false} />}
      title={book.title}
      href={`/book/${book.itemId}`}
      onOpen={open}
      sub={book.author}
      status={resumeStatus({
        duration,
        currentTime,
        chapters: here ? player.chapters : [],
        chapterIndex: here ? player.chapterIndex : undefined,
        leftOnAction: !playing,
      })}
      progress={duration > 0 ? Math.min(1, currentTime / duration) : 0}
      progressLabel={`Progress through ${book.title}`}
      playing={playing}
      actionLabel={playing ? undefined : resumeLabel(duration, currentTime)}
      busy={player.item?.id === book.itemId && player.status === 'loading'}
      onAction={() => (playing ? player.toggle() : onPlay(book.itemId))}
      wash={wash}
    />
  );
}
