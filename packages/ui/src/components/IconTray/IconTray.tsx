import type { ReactNode } from 'react';
import { Bookmark, BookmarkPlus, History, ListMusic, Settings } from 'lucide-react';
import styles from './IconTray.module.css';

interface Props {
  /** Accessible name of the group, e.g. "Player options". */
  label: string;
  /** TrayButtons, and the speed and sleep controls (their buttons take the tray's look). */
  children: ReactNode;
  className?: string;
}

/**
 * A quiet row of icon buttons in one tonal container, spread evenly: the secondary controls under a player's
 * transport. Every button inside gets the same treatment, so nothing reads as a different kind of control.
 */
export function IconTray({ label, children, className }: Props) {
  return (
    <div role="group" aria-label={label} className={[styles.tray, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

/** `bookmark` adds one (a bookmark with a plus); `bookmarks` opens the list. */
const ICONS = {
  chapters: ListMusic,
  history: History,
  settings: Settings,
  bookmark: BookmarkPlus,
  bookmarks: Bookmark,
} as const;

interface ButtonProps {
  icon: keyof typeof ICONS;
  /** The accessible name, since the button shows only the icon. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** An icon-only button for an IconTray. */
export function TrayButton({ icon, label, onClick, disabled }: ButtonProps) {
  const Icon = ICONS[icon];
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      <Icon size="1.3em" aria-hidden="true" />
    </button>
  );
}
