import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Artwork, MoreMenu, ResumeHero, useDominantColor } from '@joepittsy/ui';
import { useChapters, useInProgress } from '../api/history';
import { coverUrl, useProgress } from '../api/libraries';
import type { Tile } from '../api/libraries';
import { usePlayer } from '../player/engine';
import { useProgressActions } from '../player/useProgressActions';
import { useContinueSeries, useRecentlyAdded } from '../api/continueSeries';
import { ContinueShelf } from './ContinueShelf';
import { continueSeriesTiles } from './continueSeries';
import { recentlyAddedTiles } from './recentlyAdded';
import { useNow } from '../screens/useNow';
import { removeMenu } from './removeMenu';
import { continueBooks, resumeStatus, splitResume } from './resume';
import styles from './ResumeHome.module.css';

interface Props {
  libraryId: string;
  /** Starts or resumes a book where it was left. */
  onPlay: (itemId: string) => void;
}

interface HeroProps {
  tile: Tile;
  onPlay: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  busy: boolean;
}

/** The book to carry on with, from the book's own data, or from the player's live position when it has the book loaded. */
function Hero({ tile, onPlay, onRemove, busy: removing }: HeroProps) {
  const navigate = useNavigate();
  const player = usePlayer();
  const progress = useProgress();
  const { item } = tile;
  const chapters = useChapters([item.id]).get(item.id)?.chapters ?? [];
  const cover = coverUrl(item);
  const wash = useDominantColor(cover);

  const here = player.item?.id === item.id && player.duration > 0;
  const duration = here ? player.duration : (item.media.duration ?? 0);
  const currentTime = here ? player.position : (progress.data?.get(item.id)?.currentTime ?? tile.progress * duration);
  const fraction = here ? Math.min(1, Math.max(0, player.position / player.duration)) : tile.progress;
  const playing = here && player.status === 'playing';
  const busy = player.item?.id === item.id && player.status === 'loading';
  const title = item.media.metadata.title;
  const menu = removeMenu(item.id, title, onRemove, removing);

  return (
    <ResumeHero
      art={<Artwork src={cover} fit="contain" lazy={false} />}
      title={title}
      href={`/book/${item.id}`}
      onOpen={() => void navigate(`/book/${item.id}`)}
      sub={item.media.metadata.authorName}
      status={resumeStatus({
        duration,
        currentTime,
        chapters: here ? player.chapters : chapters,
        chapterIndex: here ? player.chapterIndex : undefined,
      })}
      progress={fraction}
      progressLabel={`Progress through ${title}`}
      playing={playing}
      busy={busy}
      onAction={() => (playing ? player.toggle() : onPlay(item.id))}
      wash={wash}
      menu={<MoreMenu label={menu.label} items={menu.items} busy={menu.busy} />}
    />
  );
}

/**
 * The top of the Books home: a resume hero for the book you were last in, then Continue listening for the rest, then
 * Continue series (the next book of series you have finished one of), then Recently added (the newest books not
 * already on home). Renders nothing when there is none of these.
 */
export function ResumeHome({ libraryId, onPlay }: Props) {
  const inProgress = useInProgress();
  const progress = useProgress();
  const continueSeries = useContinueSeries(libraryId);
  const recentlyAdded = useRecentlyAdded(libraryId);
  const now = useNow();
  const playerItem = usePlayer().item?.id;
  // Remove from Continue listening, with Undo. Once the server has the book hidden, it drops out of `tiles`, so the
  // next book becomes the hero.
  const { run, busy } = useProgressActions();
  const remove = (itemId: string) => void run(itemId, 'hide');
  const tiles = useMemo(
    () => continueBooks(inProgress.data, progress.data ?? new Map(), libraryId),
    [inProgress.data, progress.data, libraryId]
  );
  // Settled first, so the series shelf doesn't show alone and then drop below a hero that arrives late.
  const seriesTiles = useMemo(
    () =>
      inProgress.isPending
        ? []
        : continueSeriesTiles(
            continueSeries.data,
            [...tiles.map((t) => t.item.id), ...(playerItem ? [playerItem] : [])],
            progress.data ?? new Map(),
          ),
    [inProgress.isPending, continueSeries.data, tiles, playerItem, progress.data]
  );
  // After the others, so it never repeats a book any of them (or the player) has; and only once progress is known, so a
  // finished book never shows for a moment.
  const recentTiles = useMemo(
    () =>
      inProgress.isPending || progress.isPending
        ? []
        : recentlyAddedTiles(
            recentlyAdded.data,
            [...tiles, ...seriesTiles].map((t) => t.item.id).concat(playerItem ? [playerItem] : []),
            progress.data ?? new Map(),
            now,
          ),
    [inProgress.isPending, progress.isPending, recentlyAdded.data, tiles, seriesTiles, playerItem, progress.data, now]
  );
  const { hero, rest } = splitResume(tiles);
  if (!hero && seriesTiles.length === 0 && recentTiles.length === 0) return null;
  return (
    <div className={styles.home}>
      {hero && <Hero key={hero.item.id} tile={hero} onPlay={onPlay} onRemove={remove} busy={busy} />}
      <ContinueShelf tiles={rest} onPlay={onPlay} onRemove={remove} busy={busy} />
      <ContinueShelf tiles={seriesTiles} onPlay={onPlay} title="Continue series" playVerb="Start" />
      <ContinueShelf tiles={recentTiles} onPlay={onPlay} title="Recently added" playVerb="Start" />
    </div>
  );
}
