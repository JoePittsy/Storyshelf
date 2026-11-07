import { usePlayer } from './engine';
import { FellAsleepOffer } from './FellAsleepOffer';
import { useFellAsleep } from './fellAsleep';
import { offerToShow } from './handoff';
import { HandoffOffer, shownHandoff } from './HandoffOffer';

/**
 * The one offer the player makes in passing, on Now Playing and above the mini player: another device's newer place,
 * or else the sleep timer's "fell asleep" place (see `offerToShow` for why that order). Never both at once.
 */
export function PlayerOffer({ variant, className }: { variant: 'inline' | 'bar'; className?: string }) {
  const p = usePlayer();
  const handoff = shownHandoff(p);
  const asleep = useFellAsleep(p.item?.id, p.position, p.status);
  const which = offerToShow({ handoff: !!handoff, asleep: !!asleep });
  if (which === 'handoff' && handoff)
    return <HandoffOffer handoff={handoff} position={p.position} variant={variant} className={className} />;
  if (which === 'asleep') return <FellAsleepOffer variant={variant} className={className} />;
  return null;
}
