import { useId, type ReactNode } from 'react';
import { useImageFallback } from '../../hooks/useImageFallback';
import styles from './TopResultCard.module.css';

interface Props {
  title: string;
  /** One line saying what it is, e.g. "Story · Maya Rowan · 2024". */
  meta?: string;
  /** Cover or photo: it fills the card. Use a large image. */
  imageUrl?: string | null;
  /** The small heading above the title, and the card's accessible name. Default "Top result". */
  heading?: string;
  /** The art and title open it. */
  onOpen: () => void;
  openLabel: string;
  onMouseEnter?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Pills and chips, under the meta line. */
  children?: ReactNode;
  className?: string;
}

/**
 * The lead result of a list, as a print with its label: the artwork fills the card edge to edge
 * and the heading, title, meta and actions sit bottom left on a scrim. With no art (or art that fails to load)
 * the card falls back to the lit wall with the tint wash, same layout. The whole card opens it.
 */
export function TopResultCard({
  title,
  meta,
  imageUrl,
  heading = 'Top result',
  onOpen,
  openLabel,
  onMouseEnter,
  onContextMenu,
  children,
  className,
}: Props) {
  const headingId = useId();
  const [art, onError] = useImageFallback(imageUrl);
  return (
    <section
      className={[styles.card, art ? styles.withArt : '', className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
      onMouseEnter={onMouseEnter}
      onContextMenu={onContextMenu}
    >
      {art && <img className={styles.fill} src={art} alt="" loading="lazy" onError={onError} />}
      <button type="button" className={styles.cover} onClick={onOpen} aria-label={openLabel} />
      <div className={styles.content}>
        <h2 id={headingId} className={styles.heading}>
          {heading}
        </h2>
        <div className={styles.title}>{title}</div>
        {meta && <div className={styles.meta}>{meta}</div>}
        {children && <div className={styles.actions}>{children}</div>}
      </div>
    </section>
  );
}
