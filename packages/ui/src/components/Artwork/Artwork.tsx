import type { ReactNode } from 'react';
import { useImageFallback } from '../../hooks/useImageFallback';
import styles from './Artwork.module.css';

interface Props {
  /** The image URL; the placeholder shows when there is none, or when it fails to load. */
  src: string | null | undefined;
  /** For the `<img>`. */
  className?: string;
  /** For the placeholder, which each caller sizes and centres itself. */
  placeholderClassName?: string;
  /** Glyph or node shown in place of the image. Decorative. */
  placeholder?: ReactNode;
  /** Native lazy loading. Default true; pass false for art that is above the fold. Applies to both images in `contain`. */
  lazy?: boolean;
  /**
   * `cover` (default) fills the frame and crops. `contain` shows the whole image and fills the empty bands with a
   * blurred, enlarged copy of it. The caller's frame must be positioned: the art fills it. Use `contain` for covers
   * of any aspect ratio, `cover` for faces.
   */
  fit?: 'cover' | 'contain';
}

/** Cover art, or a placeholder. Callers own the frame and the class names. */
export function Artwork({
  src,
  className,
  placeholderClassName,
  placeholder = '◌',
  lazy = true,
  fit = 'cover',
}: Props) {
  const [shown, onError] = useImageFallback(src);
  const loading = lazy ? 'lazy' : undefined;
  if (shown && fit === 'contain')
    return (
      <span className={styles.frame}>
        <img className={styles.backdrop} src={shown} alt="" aria-hidden="true" loading={loading} decoding="async" />
        <img
          className={className ? `${className} ${styles.main}` : styles.main}
          src={shown}
          alt=""
          loading={loading}
          onError={onError}
        />
      </span>
    );
  return shown ? (
    <img className={className} src={shown} alt="" loading={loading} onError={onError} />
  ) : (
    <span className={placeholderClassName} aria-hidden="true">
      {placeholder}
    </span>
  );
}
