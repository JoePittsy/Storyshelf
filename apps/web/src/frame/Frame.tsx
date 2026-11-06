import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Select, Tabs, TopBar } from '@joepittsy/ui';
import { NAV_TABS, withLibrary } from '../api/people';
import { pickLibrary, storeLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { AccountMenu } from './AccountMenu';
import { pageTitle, useDocumentTitle } from './useDocumentTitle';
import { usePlayer } from '../player/engine';
import { useRouteTrail } from './routeTrail';
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
      // Toasts live in <body>, outside the frame, and sit above the player by this much.
      document.documentElement.style.setProperty('--player-h', `${player.offsetHeight}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    ro.observe(player);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--player-h');
    };
  }, []);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { data: libs = [] } = useLibraries();
  const current = pickLibrary(libs, params.get('library'), storedLibrary());

  // The tab for this page: a library list, or History and its own sections. Detail pages (a book) have none.
  const tab = NAV_TABS.find((t) => (t.key === 'history' ? pathname.startsWith('/history') : t.path === pathname));
  const immersive = pathname === '/now-playing';
  useRouteTrail();
  // History's own sections share one destination, so moving between them leaves focus on the tab.
  const announcement = useRouteAnnouncement(pathname.startsWith('/history') ? '/history' : pathname);

  // Only worth showing when there's a choice to make.
  const picker = libs.length > 1 && current && (
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
        className={`${styles.bar}${immersive ? ' ' + styles.hidden : ''}`}
        start={
          <Link to={withLibrary('/', current)} className={styles.name}>
            Storyshelf
          </Link>
        }
        centre={picker}
        end={<AccountMenu />}
      />
      {tab && !immersive && (
        <div className={styles.tabs}>
          <Tabs
            label="Sections"
            current={tab.key}
            items={NAV_TABS.map((t) => ({ key: t.key, label: t.label, href: withLibrary(t.path, current) }))}
            onNavigate={(href) => void navigate(href)}
          />
        </div>
      )}
      <div className={styles.content}>
        <Outlet />
      </div>
      {pathname === '/now-playing' ? <NowPlayingTitle /> : STATIC_TITLES[pathname] && <StaticTitle title={STATIC_TITLES[pathname]} />}
      <p className={styles.announce} role="status">
        {announcement}
      </p>
      {/* Layout slot for the mini player: collapses while empty. */}
      <div id="mini-player-slot" className={styles.player} />
    </div>
  );
}

/** Titles for the routes that load nothing; a screen with a name to show (a book, an author) sets its own. */
const STATIC_TITLES: Record<string, string> = {
  '/': 'Library',
  '/authors': 'Authors',
  '/narrators': 'Narrators',
  '/series': 'Series',
  '/debug': 'Player log',
};

function StaticTitle({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

/** The immersive player's title is the book. Its own component, so the frame doesn't re-render with the player. */
function NowPlayingTitle() {
  const { item } = usePlayer();
  useDocumentTitle(item ? `Now playing: ${item.title}` : 'Now playing');
  return null;
}

/**
 * A route change has to be noticed without sight: focus moves to the new page (its main, so the next Tab starts in its
 * content) and its title is announced once it settles, since a screen sets it only when its data arrives. Not on the
 * first load, and not for a query-string change (a filter, the library picker) on the same page.
 */
function useRouteAnnouncement(pathname: string): string {
  const [text, setText] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const main = document.querySelector<HTMLElement>('main');
    if (main) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
    const title = document.querySelector('title');
    const say = () => setText(document.title);
    const settle = setTimeout(say, 300);
    // A late title (a book's name after its fetch) is read too, for a few seconds after the change.
    const watch = title ? new MutationObserver(say) : null;
    watch?.observe(title!, { childList: true, characterData: true, subtree: true });
    const stopWatching = setTimeout(() => watch?.disconnect(), 4000);
    return () => {
      clearTimeout(settle);
      clearTimeout(stopWatching);
      watch?.disconnect();
    };
  }, [pathname]);
  return text || pageTitle();
}
