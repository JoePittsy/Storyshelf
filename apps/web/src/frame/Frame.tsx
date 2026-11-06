import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { PillButton, Select, Tabs, TopBar } from '@joepittsy/ui';
import { logout } from '../api/auth';
import { stop } from '../player/engine';
import { LIBRARY_TABS, withLibrary } from '../api/people';
import { pickLibrary, storeLibrary, storedLibrary, useLibraries } from '../api/libraries';
import styles from './Frame.module.css';

/** The signed-in app frame: header, routed content, and an empty bottom region the mini player will fill. */
export function Frame() {
  const frameRef = useRef<HTMLDivElement>(null);
  // Publish the sticky bar's and the player's heights so pages can pin things clear of both.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const bar = frame?.querySelector<HTMLElement>('header');
    const player = frame?.querySelector<HTMLElement>('#mini-player-slot');
    if (!frame || !bar || !player || typeof ResizeObserver === 'undefined') return;
    const set = () => {
      frame.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
      frame.style.setProperty('--player-h', `${player.offsetHeight}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    ro.observe(player);
    return () => ro.disconnect();
  }, []);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { data: libs = [] } = useLibraries();
  const current = pickLibrary(libs, params.get('library'), storedLibrary());

  const tab = LIBRARY_TABS.find((t) => t.path === pathname);

  const picker = libs.length > 0 && current && (
    <Select
      label="Library"
      hideLabel
      className={styles.picker}
      value={current}
      options={libs.map((l) => ({ value: l.id, label: l.name }))}
      onChange={(id) => {
        storeLibrary(id);
        // Stay on the same tab; a detail page (book, narrator) goes back to the library.
        void navigate(withLibrary(tab?.path ?? '/', id));
      }}
    />
  );

  return (
    <div className={styles.frame} ref={frameRef}>
      <TopBar
        className={styles.bar}
        start={<span className={styles.name}>Storyshelf</span>}
        centre={picker}
        end={
          <PillButton onClick={() => void stop().then(logout).then(() => qc.setQueryData(['session'], null))}>Sign out</PillButton>
        }
      />
      {tab && (
        <div className={styles.tabs}>
          <Tabs
            label="Library sections"
            current={tab.key}
            items={LIBRARY_TABS.map((t) => ({ key: t.key, label: t.label, href: withLibrary(t.path, current) }))}
            onNavigate={(href) => void navigate(href)}
          />
        </div>
      )}
      <div className={styles.content}>
        <Outlet />
      </div>
      {/* Layout slot for the mini player: collapses while empty. */}
      <div id="mini-player-slot" className={styles.player} />
    </div>
  );
}
