import { Car, Keyboard } from 'lucide-react';
import styles from './IconButton.module.css';

const ICONS = { car: Car, keyboard: Keyboard } as const;

interface Props {
  icon: keyof typeof ICONS;
  /** The accessible name and tooltip, since the button shows only the icon. */
  label: string;
  onClick: () => void;
  /** The key that does the same, e.g. "C": announced, and shown in the tooltip. */
  shortcut?: string;
  className?: string;
}

/**
 * A quiet 44px icon circle, the AirPlay button's twin: no fill until hovered, secondary label colour. For a header
 * action beside the sheet's chevron or the AirPlay button.
 */
export function IconButton({ icon, label, onClick, shortcut, className }: Props) {
  const Icon = ICONS[icon];
  return (
    <button
      type="button"
      className={[styles.button, className].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon size="1.35em" aria-hidden="true" />
    </button>
  );
}
