import { MoreMenu, type MoreMenuItem } from '@joepittsy/ui';
import { useProgressActions } from '../player/useProgressActions';

interface Props {
  itemId: string;
  /** As the page shows it: the player's place while the book is in it, else the server's. */
  isFinished: boolean;
  /** Any place to lose: started, or finished. */
  hasProgress: boolean;
  /** Offer Remove from Continue listening: the book is in progress and still on it. */
  canHide?: boolean;
  className?: string;
}

/**
 * A book's secondary progress actions: mark finished or not finished, remove from Continue listening, and reset. Each
 * one offers Undo.
 */
export function BookProgressMenu({ itemId, isFinished, hasProgress, canHide, className }: Props) {
  const { run, busy } = useProgressActions();
  const items: MoreMenuItem[] = [
    isFinished
      ? { label: 'Mark as not finished', onSelect: () => void run(itemId, 'unfinish') }
      : { label: 'Mark as finished', onSelect: () => void run(itemId, 'finish') },
  ];
  if (canHide) items.push({ label: 'Remove from Continue listening', onSelect: () => void run(itemId, 'hide') });
  if (hasProgress) items.push({ label: 'Reset progress', danger: true, onSelect: () => void run(itemId, 'reset') });
  return (
    <MoreMenu
      label="More actions"
      items={items.map((i) => ({ ...i, disabled: busy }))}
      busy={busy}
      className={className}
    />
  );
}
