import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { onSignedOut, restoreSession } from './api/auth';
import { isNetworkError } from './api/connectivity';
import { Frame } from './frame/Frame';
import { OfflineLaunch } from './frame/Offline';
import { useScrollRestoration } from './frame/useScrollRestoration';
import { Author } from './screens/Author';
import { Debug } from './screens/Debug';
import { diag } from './player/diag';
import { StorageTest } from './screens/StorageTest';
import { Book } from './screens/Book';
import { CarMode } from './screens/CarMode';
import { play } from './player/engine';
import { useRefreshOnSave } from './player/useRefreshOnSave';
import { MiniPlayerPortal } from './player/MiniPlayerPortal';
import { HandoffWatch } from './player/HandoffWatch';
import { PlayerToasts } from './player/PlayerToasts';
import { AuthorList } from './screens/AuthorList';
import { Collection, Playlist } from './screens/BookListDetail';
import { CollectionList, PlaylistList } from './screens/BookListIndex';
import { History, HistoryFinished, HistoryLog, HistoryStats } from './screens/History';
import { Library } from './screens/Library';
import { NarratorList } from './screens/NarratorList';
import { NarratorRedirect } from './screens/NarratorRedirect';
import { SeriesList } from './screens/SeriesList';
import { NowPlaying } from './screens/NowPlaying';
import { Series } from './screens/Series';
import { Settings } from './screens/Settings';
import { SignIn } from './screens/SignIn';

/** restoreSession, with what it decided in the player log: how the app opened, readable later from Settings. */
async function restoreLogged() {
  document.documentElement.dataset.boot = 'waiting for the session';
  diag.log('session: restoring');
  try {
    const user = await restoreSession();
    diag.log(
      `session: ${!user ? 'signed out' : user.accessToken ? 'renewed online' : 'offline, as the remembered user'}`
    );
    return user;
  } catch (e) {
    diag.log('session: failed', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    throw e;
  }
}

const useSession = () => useQuery({ queryKey: ['session'], queryFn: restoreLogged, staleTime: Infinity });

/**
 * Holds the session; sends signed-out visitors to /sign-in, remembering where they were going. Offline is not signed
 * out: the session is then the user last signed in here (see restoreSession), or, with none kept, a note that the app
 * needs a connection.
 */
export function RequireSession() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user, isPending, error } = useSession();
  useEffect(
    () =>
      onSignedOut(() => {
        qc.setQueryData(['session'], null);
        void navigate('/sign-in', { replace: true });
      }),
    [qc, navigate]
  );
  if (isPending) return <div className="skeleton appLoading" role="status" aria-label="Loading" />;
  if (!user && isNetworkError(error)) return <OfflineLaunch />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function App() {
  useRefreshOnSave();
  return (
    <>
      <PlayerToasts />
      <HandoffWatch />
      <AppRoutes />
      <MiniPlayerPortal />
    </>
  );
}

/** The book screen with its play buttons wired to the player (REQ-14, REQ-15). */
function PlayableBook() {
  const { id = '' } = useParams();
  const start = (from?: number) => void play(id, from);
  return <Book onPlay={start} onChapter={start} />;
}

/** The library with its Continue listening tiles wired to the player (REQ-54). */
function PlayableLibrary() {
  return <Library onPlay={(id) => void play(id)} />;
}

/** A series with its main button wired to the player. */
function PlayableSeries() {
  return <Series onPlay={(id, from) => void play(id, from)} />;
}

/** A collection or playlist with its Play and per-book play buttons wired to the player. */
function PlayableCollection() {
  return <Collection onPlay={(id, from) => void play(id, from)} />;
}
function PlayablePlaylist() {
  return <Playlist onPlay={(id, from) => void play(id, from)} />;
}

function AppRoutes() {
  useScrollRestoration();
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route path="/car" element={<CarMode />} />
        <Route element={<Frame />}>
          <Route path="/" element={<PlayableLibrary />} />
          <Route path="/authors" element={<AuthorList />} />
          <Route path="/narrators" element={<NarratorList />} />
          <Route path="/series" element={<SeriesList />} />
          <Route path="/collections" element={<CollectionList />} />
          <Route path="/playlists" element={<PlaylistList />} />
          <Route path="/collection/:id" element={<PlayableCollection />} />
          <Route path="/playlist/:id" element={<PlayablePlaylist />} />
          <Route path="/narrator/:name" element={<NarratorRedirect />} />
          <Route path="/book/:id" element={<PlayableBook />} />
          <Route path="/now-playing" element={<NowPlaying />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/debug" element={<Debug />} />
          <Route path="/debug/storage" element={<StorageTest />} />
          <Route path="/author/:id" element={<Author />} />
          <Route path="/series/:id" element={<PlayableSeries />} />
          <Route path="/history" element={<History />}>
            <Route index element={<HistoryLog />} />
            <Route path="finished" element={<HistoryFinished />} />
            <Route path="stats" element={<HistoryStats />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
