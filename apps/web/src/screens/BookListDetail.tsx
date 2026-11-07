import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Artwork, ExpandableText, HeroBand, PillButton } from '@joepittsy/ui';
import { playLabel, playTarget, useBookList } from '../api/bookLists';
import type { ListKind } from '../api/bookLists';
import { coverUrl, mergeProgress, useProgress } from '../api/libraries';
import { bookCount } from '../api/people';
import { useDocumentTitle } from '../frame/useDocumentTitle';
import { usePanelColor } from '../frame/usePanelColor';
import { BackLink } from '../components/BackLink';
import { BookGrid, BookGridSkeleton } from '../components/BookGrid';
import { LoadFailed } from '../components/LoadFailed';
import { usePlayer } from '../player/engine';
import styles from './Collection.module.css';

interface Props {
  /** Starts or resumes a book; `from` is seconds into it, left out to carry on where the server has it. */
  onPlay?: (itemId: string, from?: number) => void;
}

/** A collection: its name and description, then its books in the collection's order. */
export function Collection(props: Props) {
  return <BookListDetail kind="collection" {...props} />;
}

/** One of the listener's playlists: its books in playlist order (podcast episodes are left out). */
export function Playlist(props: Props) {
  return <BookListDetail kind="playlist" {...props} />;
}

const episodes = (n: number) => `${n} podcast ${n === 1 ? 'episode' : 'episodes'} not shown`;

function BookListDetail({ kind, onPlay }: Props & { kind: ListKind }) {
  const { id = '' } = useParams();
  const player = usePlayer();
  const list = useBookList(kind, id);
  const progress = useProgress();
  useDocumentTitle(list.data?.name);
  const map = progress.data ?? new Map();
  const books = list.data?.books;
  const tiles = useMemo(() => mergeProgress(books ?? [], progress.data ?? new Map()), [books, progress.data]);
  const target = books ? playTarget(books, map) : undefined;
  // The art is the book Play would start, as on a series page; its colour washes the hero and the page.
  const heroBook = target?.item ?? books?.[0];
  const cover = heroBook ? coverUrl(heroBook) : null;
  const wash = usePanelColor(cover);

  if (!list.data || list.isError)
    return (
      <main className={styles.page}>
        <BackLink />
        {list.isError ? (
          <div className={styles.state}>
            <LoadFailed error={list.error} noun={kind} onRetry={() => void list.refetch()} />
          </div>
        ) : (
          <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />
        )}
      </main>
    );

  const { name, description, skipped } = list.data;
  const count = list.data.books.length;
  const playing = !!target && player.item?.id === target.item.id && player.status === 'playing';
  const label = target ? playLabel(target, map) : '';

  return (
    <main className={styles.page}>
      <BackLink />
      <HeroBand
        kind={kind === 'collection' ? 'Collection' : 'Playlist'}
        title={name}
        wash={wash}
        art={<Artwork src={cover} fit="contain" placeholderClassName={styles.ph} lazy={false} />}
      >
        <p className={styles.line}>{skipped > 0 ? `${bookCount(count)} · ${episodes(skipped)}` : bookCount(count)}</p>
        {description && (
          <ExpandableText lines={4} className={styles.bio}>
            <p className={styles.prose}>{description}</p>
          </ExpandableText>
        )}
        {/* Not until progress is in, or it would say Play and then change its mind. */}
        {target && !progress.isPending && (
          <PillButton
            variant="primary"
            className={styles.action}
            // The name says which book: the button may start one partway down the list.
            aria-label={playing ? undefined : `${label}: ${target.item.media.metadata.title}`}
            onClick={() => (playing ? player.toggle() : onPlay?.(target.item.id, target.from))}
          >
            {playing ? 'Pause' : label}
          </PillButton>
        )}
      </HeroBand>

      {progress.isPending ? (
        <BookGridSkeleton count={Math.min(Math.max(count, 1), 12)} />
      ) : (
        <BookGrid tiles={tiles} onPlay={(itemId) => onPlay?.(itemId)} />
      )}
    </main>
  );
}
