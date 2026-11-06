import type { ReactNode } from 'react';
import { useImageFallback } from '../../hooks/useImageFallback';

interface Props {
  /** The image URL; the placeholder shows when there is none, or when it fails to load. */
  src: string | null | undefined;
  /** For the `<img>`. */
  className?: string;
  /** For the placeholder, which each caller sizes and centres itself. */
  placeholderClassName?: string;
  /** Glyph or node shown in place of the image. Decorative. */
  placeholder?: ReactNode;
  /** Native lazy loading. Default true; pass false for art that is above the fold. */
  lazy?: boolean;
}

/** Cover art, or a placeholder. Callers own the frame and the class names. */
export function Artwork({ src, className, placeholderClassName, placeholder = '◌', lazy = true }: Props) {
  const [shown, onError] = useImageFallback(src);
  return shown ? (
    <img className={className} src={shown} alt="" loading={lazy ? 'lazy' : undefined} onError={onError} />
  ) : (
    <span className={placeholderClassName} aria-hidden="true">
      {placeholder}
    </span>
  );
}
