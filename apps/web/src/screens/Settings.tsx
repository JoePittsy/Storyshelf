import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { PillButton, SectionCard, Select, UserAvatar } from '@joepittsy/ui';
import { restoreSession } from '../api/auth';
import { pickLibrary, storeLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { ShortcutList } from '../frame/ShortcutList';
import { useSignOut } from '../frame/useSignOut';
import { usePlayer } from '../player/engine';
import { SKIP_OPTIONS } from '../player/settings';
import styles from './Settings.module.css';

const skipOptions = SKIP_OPTIONS.map((n) => ({ value: String(n), label: `${n} seconds` }));

/** Settings: the account, how playback skips, and the keyboard shortcuts. A route in the frame, so it has its own tab. */
export function Settings() {
  const { data: user } = useQuery({ queryKey: ['session'], queryFn: restoreSession, staleTime: Infinity });
  const { skipBack, skipForward, setSkip } = usePlayer();
  const { ask, dialog } = useSignOut();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: libs = [] } = useLibraries();
  const current = pickLibrary(libs, params.get('library'), storedLibrary());
  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Settings</h1>

      <SectionCard title="Account">
        <div className={styles.account}>
          {user && <UserAvatar name={user.username} className={styles.avatar} />}
          <p className={styles.who}>
            Signed in as <strong>{user?.username}</strong>
          </p>
          <PillButton onClick={ask}>Sign out</PillButton>
        </div>
      </SectionCard>

      {/* The top bar's picker is not on a phone, so a household with several libraries chooses here. */}
      {libs.length > 1 && current && (
        <SectionCard title="Library">
          <Select
            label="Library"
            value={current}
            options={libs.map((l) => ({ value: l.id, label: l.name }))}
            onChange={(id) => {
              storeLibrary(id);
              void navigate(`/settings?library=${encodeURIComponent(id)}`, { replace: true });
            }}
          />
        </SectionCard>
      )}

      <SectionCard title="Playback" sub="How far the skip buttons and the Left and Right keys move.">
        <div className={styles.fields}>
          <Select label="Skip back" value={String(skipBack)} options={skipOptions} onChange={(v) => setSkip(Number(v), skipForward)} />
          <Select label="Skip forward" value={String(skipForward)} options={skipOptions} onChange={(v) => setSkip(skipBack, Number(v))} />
        </div>
      </SectionCard>

      <SectionCard title="Keyboard shortcuts">
        <ShortcutList />
      </SectionCard>
      {dialog}
    </main>
  );
}
