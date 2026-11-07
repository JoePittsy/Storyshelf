import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { MiniPlayer } from '@joepittsy/ui';
import { MiniUpNext } from '../components/UpNext';
import { FellAsleepOffer } from './FellAsleepOffer';
import { usePlayer } from './engine';
import { ModeAnnouncer } from './ModeAnnouncer';
import { useModeTap, useProgress } from './progressMode';

/**
 * The mini player, portalled into the frame's bottom slot whenever a book is loaded. Hidden on the full player. It is
 * deliberately slim: cover and title, skip back / play / skip forward, the seek bar with its time, and Expand. Chapters,
 * speed, sleep and the progress modes live on Now Playing.
 */
export function MiniPlayerPortal() {
  const p = usePlayer();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { window: w } = useProgress();
  const { flash, onTap } = useModeTap();
  // The slot lives in the Frame. A book only loads from inside the Frame, so it is in the DOM by the time one is loaded.
  const slot = document.getElementById('mini-player-slot');

  if (!slot || !p.item || pathname === '/now-playing') return null;
  const open = () => void navigate('/now-playing');
  return (
    <>
      {createPortal(
        <>
          {/* Above the bar, in the same portal so it stays above it. Only once a book has ended. */}
          <MiniUpNext />
          {/* Only after the sleep timer has paused the book, until it plays or moves. */}
          <FellAsleepOffer variant="bar" />
          <MiniPlayer
            art={p.item.coverUrl}
            artFit="contain"
            title={p.item.title}
            subtitle={p.chapters[p.chapterIndex]?.title}
            author={p.item.author}
            position={Math.max(0, p.position - w.start) * 1000}
            duration={(w.end - w.start) * 1000}
            playing={p.status === 'playing'}
            busy={p.status === 'loading'}
            skipBackSeconds={p.skipBack}
            skipForwardSeconds={p.skipForward}
            onSkipBack={() => p.skip(-1)}
            onSkipForward={() => p.skip(1)}
            onTogglePlay={p.toggle}
            onSeek={w.seekable ? (ms) => p.seek(ms / 1000 + w.start) : undefined}
            onTap={onTap}
            flash={flash}
            markers={w.markers}
            timeLabel={w.label}
            onExpand={open}
            onOpen={open}
          />
        </>,
        slot,
      )}
      {createPortal(<ModeAnnouncer text={flash} />, slot)}
    </>
  );
}
