import type { MouseEvent } from 'react';
import { UserAvatar } from '../UserAvatar';
import styles from './PersonLink.module.css';

interface Props {
  name: string;
  /** What the avatar's initial and colour come from, when `name` is written differently ("Surname, First"). Defaults to `name`. */
  avatarName?: string;
  imageUrl?: string | null;
  /** Muted line under the name, e.g. "9 books". */
  caption?: string;
  href: string;
  /** Called on a plain click, so a router can navigate without a reload. Modified clicks open the link as normal. */
  onOpen: () => void;
}

/** A person as a link: avatar (initials without a photo), name and a caption on a tonal card. Fills its container, so a grid sets the width. */
export function PersonLink({ name, avatarName, imageUrl, caption, href, onOpen }: Props) {
  const click = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen();
  };
  return (
    <a href={href} className={styles.link} onClick={click}>
      <UserAvatar name={avatarName ?? name} imageUrl={imageUrl} className={styles.avatar} />
      <span className={styles.who}>
        <span className={styles.name}>{name}</span>
        {caption && <span className={styles.caption}>{caption}</span>}
      </span>
    </a>
  );
}
