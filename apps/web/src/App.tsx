import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { onSignedOut, restoreSession } from './api/auth';
import { Frame } from './frame/Frame';
import { Author } from './screens/Author';
import { Book } from './screens/Book';
import { play } from './player/engine';
import { MiniPlayerPortal } from './player/MiniPlayerPortal';
import { PlayerToasts } from './player/PlayerToasts';
import { Library } from './screens/Library';
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route element={<Frame />}>
          <Route path="/" element={<Library />} />
          <Route path="/book/:id" element={<PlayableBook />} />
          <Route path="/now-playing" element={<NowPlaying />} />
          <Route path="/author/:id" element={<Author />} />
          <Route path="/series/:id" element={<Series />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
