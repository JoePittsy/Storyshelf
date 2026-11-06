import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { PillButton } from '@joepittsy/ui';
import { logout, onSignedOut, restoreSession } from './api/auth';
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

// PLACEHOLDER: library slice
function Home() {
  const qc = useQueryClient();
  const { data: user } = useSession();
  return (
    <main>
      <p>Signed in as {user?.username}</p>
      <PillButton onClick={() => void logout().then(() => qc.setQueryData(['session'], null))}>Sign out</PillButton>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route element={<RequireSession />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
