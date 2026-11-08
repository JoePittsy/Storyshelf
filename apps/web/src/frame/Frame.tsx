import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Select, Tabs, TopBar } from '@joepittsy/ui';
import { isLibrarySection, navTabFor, navTabsFor, withLibrary } from '../api/people';
import { pickLibrary, storeLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { AccountMenu } from './AccountMenu';
import { pageTitle, useDocumentTitle } from './useDocumentTitle';
import { usePlayer } from '../player/engine';
import { RestoreLastBook } from '../player/RestoreLastBook';
import { appKeyAction } from '../player/shortcuts';
import { usePlayerJump } from '../player/useUndoableJump';
import { useBookmarkHere } from '../player/useBookmarkHere';
import { useToast } from '@joepittsy/ui';
import { ShortcutsDialog } from './ShortcutsDialog';
import { NeedsConnection, OfflineAnnouncer, OfflineBadge } from './Offline';
import { useNeedsConnection } from './useNeedsConnection';
import { useOffline } from '../api/connectivity';
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
  const { data: libs = [], isPending: libsPending } = useLibraries();
  const current = pickLibrary(libs, params.get('library'), storedLibrary());
  // Opened from the account menu, whose panel has closed by then: focus goes back to the account button.
  const [help, setHelp] = useState<'menu' | 'key' | null>(null);
  const focusSearch = useSearchFocus(() => void navigate(withLibrary('/', current)), pathname === '/');

  // The tab for this page: a library list (Collections and Playlists sit under Library), or History and its own
  // sections. Detail pages (a book, a collection) have none.
  const tab = navTabFor(pathname);
  const immersive = pathname === '/now-playing';
  useRouteTrail();
  // History's own sections share one destination, so moving between them leaves focus on the tab.
  const announcement = useRouteAnnouncement(pathname.startsWith('/history') ? '/history' : pathname);
  const needsConnection = useNeedsConnection();
  // Offline, only the tabs that work without the server.
  const offline = useOffline();

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
        // Stay on the same tab (and the same library section); a detail page (book, narrator) goes back to the library.
        void navigate(withLibrary(isLibrarySection(pathname) ? pathname : (tab?.path ?? '/'), id));
      }}
    />
  );

  return (
    <div className={styles.frame} ref={frameRef}>
      <a href="#main" className={styles.skip} onClick={skipToContent}>
        Skip to content
      </a>
      <RestoreLastBook libraryId={current} librariesPending={libsPending} />
      <GlobalKeys onSearch={focusSearch} onHelp={() => setHelp('key')} onCar={() => void navigate('/car')} />
      <TopBar
        className={`${styles.bar}${immersive ? ' ' + styles.hidden : ''}`}
        start={
          <Link to={withLibrary('/', current)} className={styles.name}>
            Storyshelf
          </Link>
        }
        centre={picker}
        end={
          <>
            <OfflineBadge />
            <AccountMenu onShowShortcuts={() => setHelp('menu')} />
          </>
        }
      />
      {tab && !immersive && (
        <div className={styles.tabs}>
          <Tabs
            label="Sections"
            current={tab.key}
            items={navTabsFor(offline).map((t) => ({
              key: t.key,
              label: t.label,
              // Settings is the app's, not the library's: no library in its address.
              href: t.key === 'settings' ? t.path : withLibrary(t.path, current),
              icon: t.icon,
              separated: t.separated,
            }))}
            onNavigate={(href) => void navigate(href)}
          />
        </div>
      )}
      {/* The skip link's target. Each screen renders its own <main> inside, so the hash works without the script. */}
      <div id="main" className={`${styles.content}${!tab && !immersive ? ' ' + styles.topless : ''}`}>
        {/* A phone has no top bar to carry the badge: it heads the page instead. */}
        {!needsConnection && <OfflineBadge className={styles.pageBadge} />}
        {/* Kept mounted while hidden: its queries are what say whether the page has anything to show. */}
        <div hidden={needsConnection}>
          <Outlet />
        </div>
        {needsConnection && <NeedsConnection />}
      </div>
      {pathname === '/now-playing' ? (
        <NowPlayingTitle />
      ) : (
        STATIC_TITLES[pathname] && <StaticTitle title={STATIC_TITLES[pathname]} />
      )}
      <p className={styles.announce} role="status">
        {announcement}
      </p>
      <OfflineAnnouncer />
      {/* Layout slot for the mini player: collapses while empty. */}
      <div id="mini-player-slot" className={styles.player} />
      {help && (
        <ShortcutsDialog
          onClose={() => {
            setHelp(null);
            if (help === 'menu')
              setTimeout(() => document.querySelector<HTMLElement>('button[aria-label^="Account:"]')?.focus());
          }}
        />
      )}
    </div>
  );
}

/**
 * The skip link, with the script: focus goes to the page's main landmark itself, so a screen reader lands on it, and the
 * address keeps no "#main" for the router to treat as a navigation. Without the script the hash does the same job.
 */
function skipToContent(e: MouseEvent) {
  const main = document.querySelector<HTMLElement>('main');
  if (!main) return;
  e.preventDefault();
  main.tabIndex = -1;
  main.focus();
}

/**
 * "/" focuses the library search, going to the library first when the listener is elsewhere. The search box appears
 * once that page has rendered, so it is looked for for a moment.
 */
function useSearchFocus(goToLibrary: () => void, onLibrary: boolean) {
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  return () => {
    const find = () => document.querySelector<HTMLInputElement>('main input[type="search"]');
    const el = find();
    if (el) return void (el.focus(), el.select());
    if (!onLibrary) goToLibrary();
    clearInterval(timer.current);
    const until = Date.now() + 1500;
    timer.current = setInterval(() => {
      const found = find();
      if (found) found.focus();
      if (found || Date.now() > until) clearInterval(timer.current);
    }, 50);
  };
}

/**
 * The keyboard shortcuts that work on every route (the player's, "/" and "?"). Player keys need a book to act on, and a
 * bare Space never starts a restored book (it says to press Play); none
 * of them fire while a sheet or dialog is open, which has its own keys. Its own component, so the frame doesn't
 * re-render with the player.
 */
function GlobalKeys({ onSearch, onHelp, onCar }: { onSearch: () => void; onHelp: () => void; onCar: () => void }) {
  const p = usePlayer();
  const { showToast } = useToast();
  const { previousChapter, nextChapter } = usePlayerJump();
  const bookmarkHere = useBookmarkHere();
  const latest = useRef({ p, onSearch, onHelp, onCar, previousChapter, nextChapter, showToast, bookmarkHere });
  useEffect(() => {
    latest.current = { p, onSearch, onHelp, onCar, previousChapter, nextChapter, showToast, bookmarkHere };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const action = appKeyAction(e);
      if (!action) return;
      const { p, onSearch, onHelp, onCar, previousChapter, nextChapter, showToast, bookmarkHere } = latest.current;
      if (action === 'search') onSearch();
      else if (action === 'help') onHelp();
      else if (!p.item) return;
      else if (action === 'car') onCar();
      else if (action === 'toggle') {
        // A restored book has no session: a bare key never starts one, a play button or the lock screen does.
        if (p.restored) showToast('Press Play to resume', 'info', { replaceKey: 'restore-hint' });
        else p.toggle();
      } else if (action === 'back') p.skip(-1);
      else if (action === 'forward') p.skip(1);
      else if (action === 'previousChapter') previousChapter();
      else if (action === 'bookmark') bookmarkHere();
      else nextChapter();
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}

/** Titles for the routes that load nothing; a screen with a name to show (a book, an author) sets its own. */
const STATIC_TITLES: Record<string, string> = {
  '/': 'Library',
  '/authors': 'Authors',
  '/narrators': 'Narrators',
  '/series': 'Series',
  '/collections': 'Collections',
  '/playlists': 'Playlists',
  '/settings': 'Settings',
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
  // The path the effect last ran for: the same path again (the first load, or StrictMode's second run) is no change.
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
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
