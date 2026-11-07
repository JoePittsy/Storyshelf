import { useLocation, useNavigate } from 'react-router';
import { Artwork, FinishedCard, UpNextCard, useDominantColor } from '@joepittsy/ui';
import { coverUrl, useProgress } from '../api/libraries';
import { usePlayer } from '../player/engine';
import { dismissUpNext, useUpNextDismissed } from '../player/upNextDismissed';
import { useNow } from '../screens/useNow';
import { finishedLine } from './finishedLine';
import { useNextInSeries, type UpNext } from './useNextInSeries';
import styles from './UpNext.module.css';

interface CardProps {
  next: UpNext;
  variant: 'card' | 'bar';
  heading?: string;
  caption: string;
  onDismiss?: () => void;
  className?: string;
}

/** The next book as an UpNextCard: its cover, title (to its page), place in the series, and Play. Offered, never auto-played. */
function NextCard({ next, variant, heading, caption, onDismiss, className }: CardProps) {
  const navigate = useNavigate();
  const player = usePlayer();
  const { item } = next.book;
  const cover = coverUrl(item);
  const wash = useDominantColor(variant === 'card' ? cover : null);
  return (
    <UpNextCard
      art={<Artwork src={cover} fit="contain" lazy={false} />}
      title={item.media.metadata.title}
      href={`/book/${item.id}`}
      onOpen={() => void navigate(`/book/${item.id}`)}
      heading={heading}
      caption={caption}
      actionLabel={next.label}
      onPlay={() => void player.play(item.id)}
      busy={player.item?.id === item.id && player.status === 'loading'}
      onDismiss={onDismiss}
      dismissLabel="Dismiss up next"
      variant={variant}
      wash={wash}
      className={className}
    />
  );
}

/** The ended book's id while Up next should show for it: it played to the end, and the listener hasn't closed it. */
function useEndedBook(): string | undefined {
  const p = usePlayer();
  const id = p.ended ? p.item?.id : undefined;
  return useUpNextDismissed(id) ? undefined : id;
}

/**
 * The end of a book with nothing after it: "Finished", its length and the days it took (only what ABS's progress can
 * vouch for), back to the library, or listen again from the start. The book's own cover colour washes it.
 */
function EndCard({ id, className }: { id: string; className?: string }) {
  const navigate = useNavigate();
  const player = usePlayer();
  const now = useNow();
  const startedAt = useProgress().data?.get(id)?.startedAt;
  const wash = useDominantColor(player.item?.coverUrl ?? null);
  return (
    <FinishedCard
      detail={finishedLine(player.duration, startedAt, now)}
      action={{ label: 'Back to library', onClick: () => void navigate('/') }}
      secondary={{ label: 'Play again', onClick: () => void player.play(id, 0) }}
      wash={wash}
      className={className}
    />
  );
}

/**
 * Now Playing, once the book has played to its end (never mid-book): the next one in its series (Up next), or, when
 * there is none, Finished. Nothing shows until the series is known, so Finished never flashes up before Up next. Closing
 * Up next sticks for that book, and does not bring Finished in its place. The ended flag lives only as long as the
 * visit, and a reload doesn't put a finished book back in the player, so neither card comes back after a reload.
 *
 * The end is said once to a screen reader, through a status that is always rendered (a live region added with its
 * words in is often not read): "Finished: <book>.", and what is up next when there is something.
 */
export function NowPlayingEnd({ className }: { className?: string }) {
  const p = usePlayer();
  const ended = p.ended ? p.item : null;
  const dismissed = useUpNextDismissed(ended?.id);
  const next = useNextInSeries(ended?.id);
  const said =
    ended && next !== undefined
      ? `Finished: ${ended.title}.${next ? ` Up next: ${next.book.item.media.metadata.title}.` : ''}`
      : '';
  return (
    <>
      <p className={styles.sr} role="status">
        {said}
      </p>
      {ended && next && !dismissed && (
        <NextCard
          next={next}
          variant="card"
          caption={next.caption}
          onDismiss={() => dismissUpNext(ended.id)}
          className={className}
        />
      )}
      {ended && next === null && <EndCard id={ended.id} className={className} />}
    </>
  );
}

/** The same, as a slim strip on the mini player. It shares Now Playing's dismissal. */
export function MiniUpNext() {
  const ended = useEndedBook();
  const next = useNextInSeries(ended);
  // The ended book's own page offers it already.
  const onItsPage = useLocation().pathname === `/book/${ended}`;
  if (!ended || !next || onItsPage) return null;
  return <NextCard next={next} variant="bar" caption={next.caption} onDismiss={() => dismissUpNext(ended)} />;
}

/** The Book screen: for a finished book, the next one in its series. It stays (no close): it is part of the page. */
export function BookNextInSeries({
  bookId,
  finished,
  className,
}: {
  bookId: string;
  finished: boolean;
  className?: string;
}) {
  const next = useNextInSeries(finished ? bookId : undefined);
  if (!next) return null;
  return (
    <NextCard
      next={next}
      variant="card"
      heading={`Next in ${next.series.name}`}
      caption={next.shortCaption}
      className={className}
    />
  );
}
