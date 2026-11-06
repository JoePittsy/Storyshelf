import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { MiniPlayer } from '@joepittsy/ui';
import { ChaptersSheet } from './ChaptersSheet';
import { usePlayer } from './engine';
import { ProgressModeControl } from './ProgressModeControl';
import { useProgress } from './progressMode';

/** The mini player, portalled into the frame's bottom slot whenever a book is loaded. Hidden on the full player. */
export function MiniPlayerPortal() {
  const p = usePlayer();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const { window: w } = useProgress();
  // The slot lives in the Frame. A book only loads from inside the Frame, so it is in the DOM by the time one is loaded.
  const slot = document.getElementById('mini-player-slot');

  if (!slot || !p.item || pathname === '/now-playing') return null;
  const open = () => void navigate('/now-playing');
  return (
    <>
      {createPortal(
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
          onPrevious={p.previousChapter}
          onNext={p.nextChapter}
          onTogglePlay={p.toggle}
          onSeek={w.seekable ? (ms) => p.seek(ms / 1000 + w.start) : undefined}
          markers={w.markers}
          timeLabel={w.label}
          modeControl={<ProgressModeControl />}
          rate={p.rate}
          onRateChange={p.setRate}
          sleep={p.sleep?.kind === 'minutes' ? p.sleep : p.sleep ? { kind: 'chapter' } : null}
          onSleepChange={p.setSleep}
          chapterOptionDisabled={p.chapters.length === 0}
          onChapters={p.chapters.length > 0 ? () => setChaptersOpen(true) : undefined}
          onExpand={open}
          onOpen={open}
        />,
        slot,
      )}
      <ChaptersSheet open={chaptersOpen} onClose={() => setChaptersOpen(false)} />
    </>
  );
}
