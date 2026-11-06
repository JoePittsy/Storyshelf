import { MoreMenu, type MoreMenuItem } from '@joepittsy/ui';
import { useProgressActions } from '../player/useProgressActions';

interface Props {
  itemId: string;
  /** As the page shows it: the player's place while the book is in it, else the server's. */
  isFinished: boolean;
  /** Any place to lose: started, or finished. */
  hasProgress: boolean;
  className?: string;
}

/** A book's secondary progress actions: mark finished or not finished, and reset. Each one offers Undo. */
export function BookProgressMenu({ itemId, isFinished, hasProgress, className }: Props) {
  const { run, busy } = useProgressActions();
  const items: MoreMenuItem[] = [
    isFinished
      ? { label: 'Mark as not finished', onSelect: () => void run(itemId, 'unfinish') }
      : { label: 'Mark as finished', onSelect: () => void run(itemId, 'finish') },
  ];
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
