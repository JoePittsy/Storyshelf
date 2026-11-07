import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { DetailList, PillButton, SectionCard, Select, UserAvatar, useToast } from '@joepittsy/ui';
import { getStatus, restoreSession } from '../api/auth';
import { pickLibrary, storeLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { ShortcutList } from '../frame/ShortcutList';
import { useSignOut } from '../frame/useSignOut';
import { useBookSpeedCount } from '../player/bookSpeeds';
import { usePlayer } from '../player/engine';
import { SKIP_OPTIONS } from '../player/settings';
import styles from './Settings.module.css';

const skipOptions = SKIP_OPTIONS.map((n) => ({ value: String(n), label: `${n} seconds` }));
// Every speed the player's speed control can set, 0.5× to 3.0× in tenths, so whatever was chosen there is listed here.
const speedOptions = Array.from({ length: 26 }, (_, i) => (5 + i) / 10).map((r) => ({
  value: r.toFixed(1),
  label: `${r.toFixed(1)}×`,
}));
const appVersion = __APP_COMMIT__ ? `${__APP_VERSION__} (${__APP_COMMIT__})` : __APP_VERSION__;
const rewindOptions = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/** Settings: the account, how playback skips, the keyboard shortcuts, and which versions are running. A route in the frame, so it has its own tab. */
export function Settings() {
  const { data: user } = useQuery({ queryKey: ['session'], queryFn: restoreSession, staleTime: Infinity });
  const { data: server } = useQuery({ queryKey: ['status'], queryFn: getStatus, staleTime: Infinity });
  const {
    skipBack,
    skipForward,
    setSkip,
    defaultRate,
    setDefaultRate,
    resetBookSpeeds,
    rewindOnResume,
    setRewindOnResume,
  } = usePlayer();
  const bookSpeeds = useBookSpeedCount();
  const { showToast } = useToast();
  const resetSpeeds = () => {
    const undo = resetBookSpeeds();
    showToast('Every book is back on the default speed', 'info', {
      action: { label: 'Undo', shortcutKey: 'u', onClick: undo },
      durationMs: 8000,
      replaceKey: 'reset-book-speeds',
    });
  };
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

      <SectionCard
        title="Playback"
        sub="Speed, the skip buttons and the Left and Right keys, and picking up after a pause."
      >
        <div className={styles.fields}>
          <Select
            label="Default speed"
            value={defaultRate.toFixed(1)}
            options={speedOptions}
            onChange={(v) => setDefaultRate(Number(v))}
          />
          <Select
            label="Rewind after a pause"
            value={rewindOnResume ? 'on' : 'off'}
            options={rewindOptions}
            onChange={(v) => setRewindOnResume(v === 'on')}
          />
          <Select
            label="Skip back"
            value={String(skipBack)}
            options={skipOptions}
            onChange={(v) => setSkip(Number(v), skipForward)}
          />
          <Select
            label="Skip forward"
            value={String(skipForward)}
            options={skipOptions}
            onChange={(v) => setSkip(skipBack, Number(v))}
          />
        </div>
        <div className={styles.notes}>
          <p className={styles.note}>
            A speed you set on the player stays with that book on this device. Other books play at the default.
          </p>
          {bookSpeeds > 0 && (
            <PillButton className={styles.noteAction} onClick={resetSpeeds}>
              Reset all book speeds
            </PillButton>
          )}
          <p className={styles.note}>
            After a pause, playback goes back a few seconds, up to 30 after a long one, so you can pick up the thread.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Keyboard shortcuts">
        <ShortcutList />
      </SectionCard>

      <SectionCard title="About">
        <DetailList
          className={styles.about}
          items={[
            { label: 'Storyshelf', value: appVersion },
            ...(server ? [{ label: 'Audiobookshelf', value: server.serverVersion }] : []),
            {
              label: 'Source code',
              value: (
                <a
                  className={styles.link}
                  href="https://github.com/JoePittsy/Storyshelf"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
              ),
            },
          ]}
        />
      </SectionCard>
      {dialog}
    </main>
  );
}
