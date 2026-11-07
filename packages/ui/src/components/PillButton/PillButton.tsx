import type { ButtonHTMLAttributes } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './PillButton.module.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** primary: the room inverted (one per view). ghost: tonal, for secondary actions. danger: tonal red, for destructive ones. */
  variant?: 'primary' | 'ghost' | 'danger';
  /** A filled glyph before the words, for a play action ("Resume · 51m left", "Play") and its Pause: ResumeHero's glyphs. */
  icon?: 'play' | 'pause';
  className?: string;
}

const GLYPHS = { play: Play, pause: Pause } as const;

/** The system's labelled button: a full pill, sentence case. Sized in em, so it follows the page scale. */
export function PillButton({ variant = 'ghost', icon, className, type = 'button', children, ...rest }: Props) {
  const Glyph = icon ? GLYPHS[icon] : null;
  return (
    <button type={type} className={[styles.pill, styles[variant], className].filter(Boolean).join(' ')} {...rest}>
      {Glyph && <Glyph className={styles.glyph} size="1.1em" fill="currentColor" aria-hidden="true" />}
      {children}
    </button>
  );
}
