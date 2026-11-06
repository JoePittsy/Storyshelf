import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { onSignedOut, restoreSession } from './api/auth';
import { Frame } from './frame/Frame';
import { Book } from './screens/Book';
import { Library } from './screens/Library';
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
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route element={<Frame />}>
          <Route path="/" element={<Library />} />
          <Route path="/book/:id" element={<Book />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
