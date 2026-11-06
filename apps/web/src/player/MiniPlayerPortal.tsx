import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { MiniPlayer } from '@joepittsy/ui';
import { chapterMarkers } from './chapters';
import { usePlayer } from './engine';

/** The mini player, portalled into the frame's bottom slot whenever a book is loaded. Hidden on the full player. */
export function MiniPlayerPortal() {
  const p = usePlayer();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The slot lives in the Frame. A book only loads from inside the Frame, so it is in the DOM by the time one is loaded.
  const slot = document.getElementById('mini-player-slot');

  if (!slot || !p.item || pathname === '/now-playing') return null;
  return createPortal(
    <MiniPlayer
      art={p.item.coverUrl}
      title={p.item.title}
      subtitle={p.item.author}
      position={p.position * 1000}
      duration={p.duration * 1000}
      playing={p.status === 'playing'}
      busy={p.status === 'loading'}
      skipBackSeconds={p.skipBack}
      onSkipBack={() => p.skip(-1)}
      onTogglePlay={p.toggle}
      onSeek={(ms) => p.seek(ms / 1000)}
      markers={chapterMarkers(p.chapters)}
      onOpen={() => void navigate('/now-playing')}
    />,
    slot,
  );
}
