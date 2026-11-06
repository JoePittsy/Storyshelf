import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { PillButton, TextField } from '@joepittsy/ui';
import { AbsError, UnsupportedServerError, assertSupported, getStatus, login } from '../api/auth';
import styles from './SignIn.module.css';

const UNSUPPORTED = {
  version: 'Storyshelf needs Audiobookshelf 2.26 or newer.',
  'no-local-auth': "This server only allows single sign-on, which Storyshelf doesn't support yet.",
  'not-initialised': 'Finish setting up Audiobookshelf before signing in.',
} as const;

function messageFor(err: unknown): string {
  if (err instanceof UnsupportedServerError) return UNSUPPORTED[err.reason];
  if (err instanceof AbsError && err.status === 401) return 'Wrong username or password.';
  if (err instanceof AbsError && err.status === 429) return 'Too many sign-in attempts. Try again in a few minutes.';
  return "Can't reach the server. Check your connection and try again.";
}

export function SignIn() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const support = useQuery({
    queryKey: ['server-support'],
    queryFn: async () => {
      const status = await getStatus();
      assertSupported(status);
      return status; // a query must not resolve to undefined, or TanStack treats it as an error
    },
    retry: false,
    staleTime: Infinity,
  });
  const unsupported = support.error instanceof UnsupportedServerError;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const user = await login(String(f.get('username')), String(f.get('password')));
      qc.setQueryData(['session'], user);
      void navigate(from, { replace: true });
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  const shown = unsupported ? messageFor(support.error) : (error ?? (support.isError ? messageFor(support.error) : undefined));

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Sign in to Storyshelf</h1>
      <div role="alert" className={styles.alert}>
        {shown}
      </div>
      {!unsupported && (
        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <TextField label="Username" name="username" autoComplete="username" required autoCapitalize="none" spellCheck={false} />
          <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
          <PillButton variant="primary" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </PillButton>
        </form>
      )}
    </main>
  );
}
