import type { CSSProperties } from 'react';
import { useImageFallback } from '../../hooks/useImageFallback';
import styles from './UserAvatar.module.css';

/** No purple: a name hash lands on 0–250° or 330–360°, never on the 250–330° violets. */
function avatarHue(hash: number): number {
  const hue = Math.abs(hash) % 280;
  return hue < 250 ? hue : hue + 80;
}

/**
 * Stable colour per person, so someone without a photo still looks like
 * themselves everywhere they appear. One hue, from 30% to 20% lightness,
 * so the white initial reads at 4.5:1 or better on every hue.
 */
export function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
    h |= 0;
  }
  const hue = avatarHue(h);
  return `linear-gradient(135deg, hsl(${hue},55%,30%), hsl(${hue},60%,20%))`;
}

/**
 * The letter an avatar shows: the first letter or digit of the name as written (not of "Surname, First"), upper-cased.
 * Whole code points, so an emoji or a letter outside the BMP isn't cut in half. Empty when the name has none.
 */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name);
  return m ? m[0].toUpperCase() : '';
}

/**
 * Round profile picture, falling back to the initial on a per-name gradient (also when the photo fails to load).
 * It is decorative: put the person's name beside it. Size and shape default to a 2em circle, and any `className`
 * overrides them, so each panel keeps its own layout.
 */
export function UserAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  const [photo, onError] = useImageFallback(imageUrl);
  // No photo: the initial is drawn by CSS (::before from --initial), not a text node. It's decoration, so it
  // must not count as visible text of the button around it (axe label-content-name-mismatch compares the two).
  const style = photo
    ? undefined
    : ({
        background: avatarGradient(name),
        '--initial': JSON.stringify(initialOf(name)),
      } as CSSProperties);
  return (
    <div
      className={[styles.avatar, className, photo ? null : styles.initial].filter(Boolean).join(' ')}
      style={style}
      aria-hidden="true"
    >
      {photo ? <img src={photo} alt="" loading="lazy" onError={onError} /> : null}
    </div>
  );
}
