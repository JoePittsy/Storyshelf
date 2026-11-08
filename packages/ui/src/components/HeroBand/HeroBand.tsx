import type { CSSProperties, ReactNode } from 'react';
import styles from './HeroBand.module.css';

interface Props {
  /** The artwork cell: an img, a mosaic, a placeholder. Fills a rounded square: 12.5em to 19em, or 7em beside the title on a phone. For a book cover pass `<Artwork fit="contain" />`: the whole cover shows over a blurred copy, and the square frame (positioned, clipped) is unchanged. */
  art: ReactNode;
  /** Small muted line above the title: "Collection", "Playlist". */
  kind?: string;
  /** The h1's content. May be an input while renaming. */
  title: ReactNode;
  /** Makes the title click-to-edit (cursor, hover, tooltip). */
  onTitleClick?: () => void;
  titleHint?: string;
  /** `r, g, b` of the artwork's dominant colour, washed in from the top left. Falls back to the tint. */
  wash?: string | null;
  /** Lines under the title: credit, meta, actions. */
  children?: ReactNode;
  /** A chip pinned top right (e.g. "Added 3 times"). On a phone it follows the lines. */
  corner?: ReactNode;
  /** A small round control (44px) pinned top right at every width, e.g. a book's download. The title keeps clear of it. */
  action?: ReactNode;
}

/**
 * The header band of a detail page, in Home's Now Playing language: large sharp art on a lit wall with
 * the artwork's colour washed across it. Sized in em: put it inside a .page-scale root that is a container.
 * On a phone-width container the art steps down beside the title and the lines run full width beneath, so the
 * page's action is on the first screen.
 */
export function HeroBand({ art, kind, title, onTitleClick, titleHint, wash, children, corner, action }: Props) {
  const style: CSSProperties | undefined = wash
    ? { background: `radial-gradient(120% 150% at 0% 0%, rgba(${wash}, 0.3), transparent 65%), var(--surface-hi)` }
    : undefined;
  return (
    <header className={[styles.header, action ? styles.withAction : ''].filter(Boolean).join(' ')} style={style}>
      <div className={styles.artWrap}>{art}</div>
      <div className={styles.meta}>
        {/* Two groups, so a phone can set the title beside the art and the lines under both; wider, they don't box. */}
        <div className={styles.head}>
          {kind && <span className={styles.kind}>{kind}</span>}
          <h1
            className={`${styles.title}${onTitleClick ? ' ' + styles.editable : ''}`}
            onClick={onTitleClick}
            title={onTitleClick ? titleHint : undefined}
          >
            {title}
          </h1>
        </div>
        {children && <div className={styles.lines}>{children}</div>}
      </div>
      {corner && <div className={styles.corner}>{corner}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}
