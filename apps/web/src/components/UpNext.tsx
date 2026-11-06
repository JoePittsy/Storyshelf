import { useLocation, useNavigate } from 'react-router';
import { Artwork, UpNextCard, useDominantColor } from '@joepittsy/ui';
import { coverUrl } from '../api/libraries';
import { usePlayer } from '../player/engine';
import { dismissUpNext, useUpNextDismissed } from '../player/upNextDismissed';
import { useNextInSeries, type UpNext } from './useNextInSeries';

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

/** Now Playing: once the book has played to its end (never mid-book), the next one in its series. Closing it sticks for that book. */
export function NowPlayingUpNext({ className }: { className?: string }) {
  const ended = useEndedBook();
  const next = useNextInSeries(ended);
  if (!ended || !next) return null;
  return (
    <NextCard
      next={next}
      variant="card"
      caption={next.caption}
      onDismiss={() => dismissUpNext(ended)}
      className={className}
    />
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
