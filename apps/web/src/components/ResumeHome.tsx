import { useMemo, useState } from 'react';
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
import { continueBooks, resumeLabel, resumeStatus } from './resume';
import { liveBooks, playerFirst, settle } from './homeOrder';
import type { Fresh, Placement } from './homeOrder';
import styles from './ResumeHome.module.css';

const ids = (tiles: Tile[]) => tiles.map((t) => t.item.id);

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
      // The action carries the time left, as on the book page, except while it reads Pause.
      status={resumeStatus({
        duration,
        currentTime,
        chapters: here ? player.chapters : chapters,
        chapterIndex: here ? player.chapterIndex : undefined,
        leftOnAction: !playing,
      })}
      progress={fraction}
      progressLabel={`Progress through ${title}`}
      playing={playing}
      actionLabel={playing ? undefined : resumeLabel(duration, currentTime)}
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
 *
 * Home is built from the data once it has loaded, and then held (see `settle`): starting a book from a tile doesn't
 * move, remove or reorder any tile, or change the hero, however the data then changes; only a tile's contents follow
 * it. What does take effect at once: Remove from Continue listening (and its Undo), a book finished, hidden or lost,
 * and another library (it starts afresh). The held home is dropped with the screen, so the next visit builds from the
 * current data again, with the book in the player first (the server only hears of it when the player first syncs).
 *
 * Until the data has settled, or the listener presses Play, home is rebuilt as the data arrives: a visit starts from
 * cached data that a refetch is about to replace.
 */
function Home({ libraryId, onPlay }: Props) {
  const inProgress = useInProgress();
  const progress = useProgress();
  const continueSeries = useContinueSeries(libraryId);
  const recentlyAdded = useRecentlyAdded(libraryId);
  const now = useNow();
  const playerItem = usePlayer().item?.id;
  // The book already loaded when home appeared: it leads, and never also shows as a new book beneath.
  const [mounted] = useState(playerItem);
  // Remove from Continue listening, with Undo. Once the server has the book hidden it is gone from `alive`, so the next
  // book becomes the hero.
  const { run, busy } = useProgressActions();
  const remove = (itemId: string) => void run(itemId, 'hide');
  const fresh = useMemo<Fresh>(() => {
    const map = progress.data ?? new Map();
    const listed = continueBooks(inProgress.data, map, libraryId);
    const alive = liveBooks([listed.map((t) => t.item), continueSeries.data ?? [], recentlyAdded.data ?? []], map);
    const listening = playerFirst(listed, mounted, alive);
    const playing = [mounted, playerItem].filter((id): id is string => !!id);
    // Settled first, so the series shelf doesn't show alone and then drop below a hero that arrives late.
    const series = inProgress.isPending
      ? []
      : continueSeriesTiles(continueSeries.data, [...ids(listening), ...playing], map);
    // After the others, so it never repeats a book any of them (or the player) has; and only once progress is known,
    // so a finished book never shows for a moment.
    const recent =
      inProgress.isPending || progress.isPending
        ? []
        : recentlyAddedTiles(recentlyAdded.data, [...ids(listening), ...ids(series), ...playing], map, now);
    return { listening, series, recent, alive };
  }, [
    inProgress.data,
    inProgress.isPending,
    progress.data,
    progress.isPending,
    continueSeries.data,
    recentlyAdded.data,
    libraryId,
    mounted,
    playerItem,
    now,
  ]);

  const [held, setHeld] = useState<Placement | null>(null);
  const placed = settle(held, fresh);
  const settled = !inProgress.isFetching && !progress.isFetching && !continueSeries.isFetching;
  // Holding starts once the data has settled or the listener presses Play, whichever is first; after that it keeps up
  // with the data. Set during render, which React allows when conditional: `settle` returns `held` itself when
  // nothing changed, so this ends.
  if (held ? placed !== held : settled) setHeld(placed);
  const play = (itemId: string) => {
    if (!held) setHeld(placed);
    onPlay(itemId);
  };

  const { hero, listening, series, recent } = placed;
  if (!hero && series.length === 0 && recent.length === 0) return null;
  return (
    <div className={styles.home}>
      {hero && <Hero key={hero.item.id} tile={hero} onPlay={play} onRemove={remove} busy={busy} />}
      <ContinueShelf tiles={listening} onPlay={play} onRemove={remove} busy={busy} />
      <ContinueShelf
        tiles={series.map((t) => ({ ...t, verb: t.progress > 0 ? 'Resume' : 'Play' }))}
        onPlay={play}
        title="Continue series"
        playVerb="Play"
      />
      <ContinueShelf tiles={recent} onPlay={play} title="Recently added" playVerb="Play" />
    </div>
  );
}

/** Keyed by library, so another library's home starts afresh rather than being held to the last one's. */
export const ResumeHome = (props: Props) => <Home key={props.libraryId} {...props} />;
