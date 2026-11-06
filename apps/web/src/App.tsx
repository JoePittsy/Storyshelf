// TEMP: replaced by sign-in screen
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router';
import { login, logout, onSignedOut, restoreSession } from './api/auth';
import { useEffect } from 'react';

function Harness() {
  const qc = useQueryClient();
  const { data: user, isPending } = useQuery({ queryKey: ['session'], queryFn: restoreSession, staleTime: Infinity });
  useEffect(() => onSignedOut(() => qc.setQueryData(['session'], null)), [qc]);
  if (isPending) return <p>Loading…</p>;
  if (!user)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          login(String(f.get('u')), String(f.get('p'))).then(
            (u) => qc.setQueryData(['session'], u),
            (err: unknown) => alert(String(err))
          );
        }}
      >
        <input name="u" placeholder="Username" autoComplete="username" />
        <input name="p" type="password" placeholder="Password" autoComplete="current-password" />
        <button type="submit">Sign in</button>
      </form>
    );
  return (
    <>
      <p>Signed in as {user.username}</p>
      <button type="button" onClick={() => void logout().then(() => qc.setQueryData(['session'], null))}>
        Sign out
      </button>
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<Harness />} />
    </Routes>
  );
}
