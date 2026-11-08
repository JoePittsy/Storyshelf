import { useId, useState, type ReactNode } from 'react';
import { useImageFallback } from '../../hooks/useImageFallback';
import { AddButton } from '../AddButton';
import { Artwork } from '../Artwork';
import styles from './ArtCard.module.css';

interface Props {
  size: 'large' | 'medium';
  /** Sentence-case caption, top left. */
  label: string;
  title: string;
  /** Line under the title; may hold links (they stay clickable above the card's open button). */
  sub?: ReactNode;
  /** Cover image: shown first, so the card is never empty. */
  imageUrl?: string | null;
  /** `contain` shows the whole cover over a blurred copy of itself. Default `cover`. The photo always crops (faces). */
  artFit?: 'cover' | 'contain';
  /** Second image (a portrait, say): fades in over the cover when it arrives, so a late photo never reshuffles the card. */
  photoUrl?: string | null;
  /** The whole card is one button. */
  onOpen: () => void;
  /** Accessible name of that button, e.g. "Open Blue". */
  openLabel: string;
  /** Small control beside the label (an InfoTip). It sits above the open button, so it never opens the card. */
  info?: ReactNode;
  /** Something hung on the art, clear of the caption line, title and + (e.g. a cluster of avatars). It places itself. */
  aside?: ReactNode;
  /**
   * Keep the caption line (label + info) out of sight until the `aside` cloud is hovered or the card has focus, then
   * fade it in. It stays in the accessibility tree (and is the open button's description), and the info stays
   * focusable, so screen readers and the keyboard still reach it at rest.
   */
  reasonOnHover?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  /** Layout from the page (grid placement). */
  className?: string;
}

/** A print with its label: the artwork is the card, with title and credit on a scrim over the lower part. */
export function ArtCard({
  size,
  label,
  title,
  sub,
  imageUrl,
  artFit = 'cover',
  photoUrl,
  onOpen,
  openLabel,
  info,
  aside,
  reasonOnHover,
  onAdd,
  addLabel,
  onContextMenu,
  onMouseEnter,
  className,
}: Props) {
  // A URL that fails to load drops its layer, leaving the raised-slate card behind it.
  const [cover, onCoverError] = useImageFallback(imageUrl);
  const [photo, onPhotoError] = useImageFallback(photoUrl);
  // The cover sits under the photo only while the photo fades in. Left stacked, the two layers can drift a pixel
  // apart while scrolling and the cover shows through at the edges.
  const [photoInFor, setPhotoInFor] = useState<string | null>(null);
  const photoIn = photo !== null && photoInFor === photo;
  const setPhotoIn = (v: boolean) => setPhotoInFor(v ? photo : null);
  const labelId = useId();
  return (
    <div
      className={[
        styles.card,
        size === 'large' ? styles.large : styles.medium,
        reasonOnHover ? styles.reasonOnHover : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
    >
      {cover &&
        !photoIn &&
        (artFit === 'contain' ? (
          <Artwork src={cover} fit="contain" className={styles.fill} placeholder={null} />
        ) : (
          <img className={styles.fill} src={cover} alt="" loading="lazy" onError={onCoverError} />
        ))}
      {photo && (
        <img
          className={`${styles.fill} ${styles.photo}`}
          src={photo}
          alt=""
          loading="lazy"
          onError={onPhotoError}
          onAnimationEnd={() => setPhotoIn(true)}
          onLoad={() => {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPhotoIn(true);
          }}
        />
      )}
      <button
        type="button"
        className={styles.cover}
        aria-label={openLabel}
        aria-describedby={reasonOnHover ? labelId : undefined}
        onClick={onOpen}
      />
      <div className={styles.top}>
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        {info}
      </div>
      {aside}
      <div className={styles.caption}>
        <div className={styles.title}>{title}</div>
        {sub != null && <div className={styles.sub}>{sub}</div>}
      </div>
      {onAdd && <AddButton variant="art" className={styles.add} label={addLabel ?? `Add ${title}`} onClick={onAdd} />}
    </div>
  );
}
