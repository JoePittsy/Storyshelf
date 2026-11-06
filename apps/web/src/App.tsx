import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { onSignedOut, restoreSession } from './api/auth';
import { Frame } from './frame/Frame';
import { Author } from './screens/Author';
import { Debug } from './screens/Debug';
import { Book } from './screens/Book';
import { play } from './player/engine';
import { MiniPlayerPortal } from './player/MiniPlayerPortal';
import { PlayerToasts } from './player/PlayerToasts';
import { AuthorList } from './screens/AuthorList';
import { History, HistoryFinished, HistoryLog, HistoryStats } from './screens/History';
import { Library } from './screens/Library';
import { NarratorList } from './screens/NarratorList';
import { NarratorRedirect } from './screens/NarratorRedirect';
import { SeriesList } from './screens/SeriesList';
import { NowPlaying } from './screens/NowPlaying';
import { Series } from './screens/Series';
import { SignIn } from './screens/SignIn';

const useSession = () => useQuery({ queryKey: ['session'], queryFn: restoreSession, staleTime: Infinity });

/** Holds the session; sends signed-out visitors to /sign-in, remembering where they were going. */
function RequireSession() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user, isPending } = useSession();
  useEffect(
    () =>
      onSignedOut(() => {
        qc.setQueryData(['session'], null);
        void navigate('/sign-in', { replace: true });
      }),
    [qc, navigate],
  );
  if (isPending) return <div className="skeleton appLoading" role="status" aria-label="Loading" />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function App() {
  return (
    <>
      <PlayerToasts />
      <AppRoutes />
      <MiniPlayerPortal />
    </>
  );
}

/** The book screen with its play buttons wired to the player (REQ-14, REQ-15). */
function PlayableBook() {
  const { id = '' } = useParams();
  const start = (from: number) => void play(id, from);
  return <Book onPlay={start} onChapter={start} />;
}

/** The library with its Continue listening tiles wired to the player (REQ-54). */
function PlayableLibrary() {
  return <Library onPlay={(id) => void play(id)} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route element={<Frame />}>
          <Route path="/" element={<PlayableLibrary />} />
          <Route path="/authors" element={<AuthorList />} />
          <Route path="/narrators" element={<NarratorList />} />
          <Route path="/series" element={<SeriesList />} />
          <Route path="/narrator/:name" element={<NarratorRedirect />} />
          <Route path="/book/:id" element={<PlayableBook />} />
          <Route path="/now-playing" element={<NowPlaying />} />
          <Route path="/debug" element={<Debug />} />
          <Route path="/author/:id" element={<Author />} />
          <Route path="/series/:id" element={<Series />} />
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
