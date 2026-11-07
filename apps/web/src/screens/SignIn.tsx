import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { PillButton, TextField } from '@joepittsy/ui';
import { AbsError, UnsupportedServerError, assertSupported, changeServer, getStatus, login } from '../api/auth';
import { ServerProbeError, getMode, getServerUrl, normalizeServerUrl, probeServer } from '../api/server';
import styles from './SignIn.module.css';

const UNSUPPORTED = {
  version: 'Storyshelf needs Audiobookshelf 2.26 or newer.',
  'no-local-auth': "This server only allows single sign-on, which Storyshelf doesn't support yet.",
  'not-initialised': 'Finish setting up Audiobookshelf before signing in.',
} as const;

function CopyOrigin() {
  const [copied, setCopied] = useState(false);
  const origin = location.origin;
  return (
    <>
      <code className={styles.origin}>{origin}</code>{' '}
      <PillButton
        className={styles.copy}
        onClick={() => {
          void navigator.clipboard?.writeText(origin).then(() => setCopied(true));
        }}
      >
        {copied ? 'Copied' : 'Copy address'}
      </PillButton>
    </>
  );
}

function messageFor(err: unknown): ReactNode {
  if (err instanceof UnsupportedServerError) return UNSUPPORTED[err.reason];
  if (err instanceof ServerProbeError) {
    if (err.kind === 'mixed-content') return 'Your server must use HTTPS.';
    if (err.kind === 'not-abs') return "That doesn't look like an Audiobookshelf server. Check the address.";
    return (
      <>
        Your server needs to allow Storyshelf. In Audiobookshelf go to Settings → Security → CORS allowed origins and
        add <CopyOrigin />. If that is already done, check the address and your connection.
      </>
    );
  }
  if (err instanceof AbsError && err.status === 401) return 'Wrong username or password.';
  if (err instanceof AbsError && err.status === 429) return 'Too many sign-in attempts. Try again in a few minutes.';
  return "Can't reach the server. Check your connection and try again.";
}

/** "https://abs.example.com/abs" reads as "abs.example.com/abs": the address as a person types it. */
const shortAddress = (url: string): string => url.replace(/^https?:\/\//i, '');

/** The wordmark as the top bar sets it, over the screen's title and what it says about the server. */
function Intro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.intro}>
      <p className={styles.wordmark}>Storyshelf</p>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </div>
  );
}

export function SignIn() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const hosted = getMode() === 'hosted';
  const [server, setServer] = useState(hosted ? getServerUrl() : null);
  const [picking, setPicking] = useState(hosted && !getServerUrl());
  const [error, setError] = useState<ReactNode>();
  const [busy, setBusy] = useState(false);

  const support = useQuery({
    queryKey: ['server-support', server],
    queryFn: async () => {
      const status = hosted && server ? await probeServer(server) : await getStatus();
      assertSupported(status);
      return status; // a query must not resolve to undefined, or TanStack treats it as an error
    },
    enabled: !hosted || (!!server && !picking),
    retry: false,
    staleTime: Infinity,
  });
  const unsupported = support.error instanceof UnsupportedServerError;

  async function onPick(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = normalizeServerUrl(String(new FormData(e.currentTarget).get('server')));
    if (!url) {
      setError("Enter your server's address, like abs.example.com.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const status = await probeServer(url);
      assertSupported(status);
      if (url !== server) {
        qc.clear(); // nothing cached from another server may show here
        changeServer(url);
      }
      qc.setQueryData(['server-support', url], status);
      setServer(url);
      setPicking(false);
    } catch (err) {
      setError(messageFor(err));
    }
    setBusy(false);
  }

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

  if (hosted && picking) {
    return (
      <main className={styles.page}>
        <div className={styles.panel}>
          <Intro title="Connect to your server" />
          <div role="alert" className={styles.alert}>
            {error}
          </div>
          <form className={styles.form} onSubmit={(e) => void onPick(e)} noValidate>
            <TextField
              label="Server address"
              name="server"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              required
              defaultValue={server ?? ''}
              hint="Your Audiobookshelf address, like abs.example.com"
            />
            <PillButton variant="primary" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Connecting…' : 'Connect'}
            </PillButton>
            {server && <PillButton onClick={() => setPicking(false)}>Cancel</PillButton>}
          </form>
        </div>
      </main>
    );
  }

  const shown = unsupported
    ? messageFor(support.error)
    : (error ?? (support.isError ? messageFor(support.error) : undefined));
  // Same-origin mode signs in to the Audiobookshelf behind this page's own address; hosted mode to the one chosen.
  const address = hosted ? server && shortAddress(server) : location.host;

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <Intro title="Sign in">
          {address && (
            <p className={styles.server}>
              <span className={styles.serverUrl}>
                Audiobookshelf at <span className={styles.address}>{address}</span>
              </span>
              {hosted && <PillButton onClick={() => setPicking(true)}>Change server</PillButton>}
            </p>
          )}
        </Intro>
        <div role="alert" className={styles.alert}>
          {shown}
        </div>
        {!unsupported && (
          <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              required
              autoCapitalize="none"
              spellCheck={false}
            />
            <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
            <PillButton variant="primary" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </PillButton>
          </form>
        )}
      </div>
    </main>
  );
}
