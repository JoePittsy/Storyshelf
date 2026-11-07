import { OfferButton } from '@joepittsy/ui';
import { fmtClock } from '../screens/bookHelpers';
import { usePlayer } from './engine';
import { forgetFellAsleep, useFellAsleep, type FellAsleep } from './fellAsleep';
import { usePlayerJump } from './useUndoableJump';

/** The words for the offer, and the name its Undo toast gives the place. */
function describe(r: FellAsleep): { label: string; shortLabel: string; jumpLabel: string } {
  const at = fmtClock(r.target, false);
  // The short form is for a small phone, where the sentence would take two lines; the moon beside it says why.
  return r.chapter === null
    ? {
        label: `Go back to where the timer began, ${at}`,
        shortLabel: `Go back to ${at}`,
        jumpLabel: 'where the timer began',
      }
    : {
        label: `Go back to the start of Chapter ${r.chapter + 1}, ${at}`,
        shortLabel: `Go back to Chapter ${r.chapter + 1}, ${at}`,
        jumpLabel: `Chapter ${r.chapter + 1}`,
      };
}

/**
 * After the sleep timer has paused the book: one tap back to where the timer began (the last place the listener was
 * surely awake), or to the start of the chapter it stopped in if that is later. It goes through the undoable jump, so
 * it can be undone, and it goes on play, on any seek, or once used.
 */
export function FellAsleepOffer({ variant, className }: { variant: 'inline' | 'bar'; className?: string }) {
  const p = usePlayer();
  const { jumpTo } = usePlayerJump();
  const offer = useFellAsleep(p.item?.id, p.position, p.status);
  if (!offer) return null;
  const { label, shortLabel, jumpLabel } = describe(offer);
  return (
    <OfferButton
      label={label}
      shortLabel={shortLabel}
      icon="moon"
      variant={variant}
      className={className}
      onClick={() => {
        forgetFellAsleep();
        jumpTo(offer.target, jumpLabel);
      }}
    />
  );
}
