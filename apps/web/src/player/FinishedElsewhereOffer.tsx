import { OfferButton } from '@joepittsy/ui';
import { carryOnHere, type FinishedElsewhere, type PlayerState } from './engine';
import { describeFinished } from './handoff';

/** The finish held back for the book in the player, or null. Shown whatever the player is doing: it is saving nothing. */
export function shownFinished(p: Pick<PlayerState, 'finishedElsewhere' | 'item'>): FinishedElsewhere | null {
  const f = p.finishedElsewhere;
  return f && f.itemId === p.item?.id ? f : null;
}

/**
 * Another device finished this book while this one was on it, so this one has stopped sending its place (it would
 * un-finish the book). One tap carries on from here, which does un-finish it: the listener's choice (see engine
 * `carryOnHere`).
 */
export function FinishedElsewhereOffer({
  finished,
  variant,
  className,
}: {
  finished: FinishedElsewhere;
  variant: 'inline' | 'bar';
  className?: string;
}) {
  const { label, shortLabel } = describeFinished(finished.device);
  return (
    <OfferButton
      label={label}
      shortLabel={shortLabel}
      icon="devices"
      variant={variant}
      className={className}
      onClick={carryOnHere}
    />
  );
}
