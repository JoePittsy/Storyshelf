import { OfferButton } from '@joepittsy/ui';
import type { Handoff, PlayerState } from './engine';
import { describeHandoff } from './handoff';
import { usePlayerJump } from './useUndoableJump';

/** The newer place on offer for the book in the player, or null: only while it sits paused (not loading or playing). */
export function shownHandoff(p: Pick<PlayerState, 'handoff' | 'item' | 'status'>): Handoff | null {
  const h = p.handoff;
  return h && p.status === 'paused' && h.itemId === p.item?.id ? h : null;
}

/**
 * Another device has moved the book on (or back) since this one paused: one tap there. It goes through the undoable
 * jump, so the Undo toast brings this device's place back. The player takes it anyway if Play is pressed (see engine).
 */
export function HandoffOffer({
  handoff,
  position,
  variant,
  className,
}: {
  handoff: Handoff;
  position: number;
  variant: 'inline' | 'bar';
  className?: string;
}) {
  const { jumpTo } = usePlayerJump();
  const { label, shortLabel, jumpLabel } = describeHandoff(handoff, position);
  return (
    <OfferButton
      label={label}
      shortLabel={shortLabel}
      icon="devices"
      variant={variant}
      className={className}
      onClick={() => jumpTo(handoff.position, jumpLabel)}
    />
  );
}
