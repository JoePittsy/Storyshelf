import type { MouseEvent } from 'react';
import { UserAvatar } from '../UserAvatar';
import styles from './Chip.module.css';

interface Props {
  label: string;
  /** Muted text after the label, e.g. "12 books". */
  meta?: string;
  /** Shows a round avatar (initials when there is no photo). Omit for a text-only chip. */
  avatar?: { name: string; imageUrl?: string | null };
  href: string;
  /** Called on a plain click, so a router can navigate without a reload. Modified clicks open the link as normal. */
  onOpen: () => void;
  /** Words ahead of the name for assistive tech, e.g. "Series". Not shown. */
  kind?: string;
}

/** A pill link, optionally with an avatar: a shortcut to a person, series or other page. Sized in em. */
export function Chip({ label, meta, avatar, href, onOpen, kind }: Props) {
  const click = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen();
  };
  return (
    <a href={href} className={`${styles.chip}${avatar ? '' : ' ' + styles.plain}`} onClick={click}>
      {avatar && <UserAvatar name={avatar.name} imageUrl={avatar.imageUrl} className={styles.avatar} />}
      {kind && <span className={styles.hidden}>{kind}: </span>}
      <span className={styles.label}>{label}</span>
      {meta && <span className={styles.meta}>{meta}</span>}
    </a>
  );
}
