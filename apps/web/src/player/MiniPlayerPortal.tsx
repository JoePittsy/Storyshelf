import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { Artwork, MiniPlayer } from '@joepittsy/ui';
import { usePlayer } from './engine';

/** The mini player, portalled into the frame's bottom slot whenever a book is loaded. Hidden on the full player. */
export function MiniPlayerPortal() {
  const p = usePlayer();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('mini-player-slot')), []);

  if (!slot || !p.item || pathname === '/now-playing') return null;
  return createPortal(
    <MiniPlayer
      art={<Artwork src={p.item.coverUrl} lazy={false} />}
      title={p.item.title}
      subtitle={p.item.author}
      position={p.position * 1000}
      duration={p.duration * 1000}
      playing={p.status === 'playing'}
      busy={p.status === 'loading'}
      skipBackSeconds={p.skipBack}
      onSkipBack={() => p.skip(-1)}
      onTogglePlay={p.toggle}
      onOpen={() => void navigate('/now-playing')}
    />,
    slot,
  );
}
