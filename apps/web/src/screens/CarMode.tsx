import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { CarPlayer, fmtRemaining, useToast } from '@joepittsy/ui';
import { pickLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { useDocumentTitle } from '../frame/useDocumentTitle';
import { carView } from '../player/carMode';
import { usePlayer } from '../player/engine';
import { RestoreLastBook } from '../player/RestoreLastBook';
import { useRestoreSettled } from '../player/restoreStatus';
import { playerKeyAction } from '../player/shortcuts';
import { usePlayerJump, type UndoOffer } from '../player/useUndoableJump';
import { useScreenWakeLock } from '../player/wakeLock';
import styles from './CarMode.module.css';

/**
 * Car mode: the player as a few huge targets for a glance and one hand, with the screen kept on. A route of its own
 * (/car), outside the app frame, so it has no top bar, tabs or mini player, survives a refresh (the last book is put
 * back as on any page), and the browser's back button or Escape leaves it. A chapter jump's Undo is a big button on
 * the screen itself, not a toast.
 */
export function CarMode() {
  const p = usePlayer();
  const navigate = useNavigate();
  const fromApp = useLocation().key !== 'default';
  const restoreSettled = useRestoreSettled();
  const libs = useLibraries();
  const library = libs.data ? pickLibrary(libs.data, null, storedLibrary()) : undefined;
  const { showToast } = useToast();
  const main = useRef<HTMLElement>(null);
  useScreenWakeLock();
  useDocumentTitle(p.item ? `Car mode: ${p.item.title}` : 'Car mode');

  const [offer, setOffer] = useState<UndoOffer | null>(null);
  useEffect(() => {
    if (!offer) return;
    const t = setTimeout(() => setOffer(null), offer.durationMs);
    return () => clearTimeout(t);
  }, [offer]);
  const { previousChapter, nextChapter } = usePlayerJump(setOffer);
  const undo = () => {
    offer?.undo();
    setOffer(null);
  };
  // Back to wherever car mode was opened from (Now Playing); opened directly, to Now Playing.
  const close = () => void (fromApp ? navigate(-1) : navigate('/now-playing', { replace: true }));

  // The keys the rest of the app has (Space, arrows, [ and ]), plus Escape to leave and U for Undo.
  const latest = useRef({ p, close, undo, offer, previousChapter, nextChapter, showToast });
  useEffect(() => {
    latest.current = { p, close, undo, offer, previousChapter, nextChapter, showToast };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const { p, close, undo, offer, previousChapter, nextChapter, showToast } = latest.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        return close();
      }
      if ((e.key === 'u' || e.key === 'U') && offer && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        return undo();
      }
      const action = playerKeyAction(e);
      if (!action || action === 'bookmark' || !p.item) return;
      e.preventDefault();
      if (action === 'toggle') {
        // As everywhere else: a bare key never starts a restored book, a play button does.
        if (p.restored) showToast('Press Play to resume', 'info', { replaceKey: 'restore-hint' });
        else p.toggle();
      } else if (action === 'back') p.skip(-1);
      else if (action === 'forward') p.skip(1);
      else if (action === 'previousChapter') previousChapter();
      else if (action === 'nextChapter') nextChapter();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Outside the frame there is no route announcement: focus the screen, so a screen reader starts here.
  const ready = !!p.item;
  useEffect(() => {
    if (ready) main.current?.focus({ preventScroll: true });
  }, [ready]);

  const restorer = <RestoreLastBook libraryId={library} librariesPending={libs.isPending} />;
  if (!p.item) {
    if (!restoreSettled)
      return (
        <main className={styles.page} aria-busy="true">
          {restorer}
          <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />
        </main>
      );
    return <Navigate to="/" replace />;
  }

  const v = carView({ position: p.position, duration: p.duration, chapters: p.chapters, rate: p.rate });
  return (
    <main ref={main} tabIndex={-1} className={styles.page} aria-label={`Car mode: ${p.item.title}`}>
      {restorer}
      <CarPlayer
        chapter={v.title}
        timeLeft={fmtRemaining(v.secondsLeft * 1000)}
        timeLeftOf={v.hasChapters ? 'chapter' : 'book'}
        progress={v.progress}
        playing={p.status === 'playing'}
        busy={p.status === 'loading'}
        skipBackSeconds={p.skipBack}
        skipForwardSeconds={p.skipForward}
        onPlayPause={p.toggle}
        onSkipBack={() => p.skip(-1)}
        onSkipForward={() => p.skip(1)}
        onPreviousChapter={v.hasChapters ? previousChapter : undefined}
        onNextChapter={v.hasChapters ? nextChapter : undefined}
        nextDisabled={!v.hasNext}
        onClose={close}
        undo={offer ? { label: 'Undo', onUndo: undo } : null}
      />
      <p className={styles.srOnly} role="status">
        {offer?.message}
      </p>
    </main>
  );
}
