import { Outlet, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { PillButton, Select, TopBar } from '@joepittsy/ui';
import { logout } from '../api/auth';
import { stop } from '../player/engine';
import { pickLibrary, storeLibrary, storedLibrary, useLibraries } from '../api/libraries';
import styles from './Frame.module.css';

/** The signed-in app frame: header, routed content, and an empty bottom region the mini player will fill. */
export function Frame() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: libs = [] } = useLibraries();
  const current = pickLibrary(libs, params.get('library'), storedLibrary());

  const picker = libs.length > 0 && current && (
    <Select
      label="Library"
      hideLabel
      value={current}
      options={libs.map((l) => ({ value: l.id, label: l.name }))}
      onChange={(id) => {
        storeLibrary(id);
        void navigate(`/?library=${encodeURIComponent(id)}`);
      }}
    />
  );

  return (
    <div className={styles.frame}>
      <TopBar
        start={<span className={styles.name}>Storyshelf</span>}
        centre={picker}
        end={
          <PillButton onClick={() => void stop().then(logout).then(() => qc.setQueryData(['session'], null))}>Sign out</PillButton>
        }
      />
      <div className={styles.content}>
        <Outlet />
      </div>
      {/* Layout slot for the mini player: collapses while empty. */}
      <div id="mini-player-slot" className={styles.player} />
    </div>
  );
}
