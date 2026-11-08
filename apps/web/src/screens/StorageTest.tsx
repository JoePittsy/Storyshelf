import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { DetailList, PillButton, ProgressBar, SectionCard, Select, TextField } from '@joepittsy/ui';
import { absFetch } from '../api/auth';
import { bookLibraries, type Library } from '../api/libraries';
import { coverUrl } from '../api/items';
import { usePlayer } from '../player/engine';
import { updateMetadata } from '../player/mediaSession';
import { download, type Progress } from '../storageTest/download';
import {
  BACKEND_LABELS,
  availableBackends,
  currentFeatures,
  defaultBackend,
  type Backend,
  type Features,
} from '../storageTest/env';
import { formatBytes, formatLog, formatRate, storageLog, useStorageLog } from '../storageTest/log';
import { DEFAULT_ENDPOINT, largestTrack, playMime, type Track } from '../storageTest/plan';
import {
  OPFS_DIR,
  deleteAll,
  deleteStored,
  listStored,
  readRunning,
  storedBlob,
  writeRunning,
  type Row,
} from '../storageTest/stores';
import { startWorker } from '../storageTest/workerProtocol';
import styles from './StorageTest.module.css';

const log = storageLog.log;
const err = (e: unknown) => `${(e as Error)?.name ?? 'Error'}: ${(e as Error)?.message ?? String(e)}`;
const time = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : '?');

/**
 * /debug/storage: tries how this device stores and plays large audio offline, before downloads are designed.
 * Everything it does is logged on screen and kept in localStorage. Not in the nav: linked from /debug.
 */
export function StorageTest() {
  const [rowsVersion, setRowsVersion] = useState(0);
  const [workerSync, setWorkerSync] = useState<boolean | null>(null);
  const progressRef = useRef<Progress | null>(null);
  const downloadingRef = useRef(false);
  const refreshRows = useCallback(() => setRowsVersion((v) => v + 1), []);

  // Opening the page: what happened last time, and how this load came about.
  useEffect(() => {
    let nav = '?';
    try {
      nav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? '?';
    } catch {
      // Older browsers: no navigation timing.
    }
    log(`Page opened (navigation: ${nav}, online: ${navigator.onLine}, visibility: ${document.visibilityState})`);
    const running = readRunning();
    if (running) {
      log(
        `Previous download never finished: ${running.key} had ${formatBytes(running.bytes)} at ${new Date(running.at).toISOString()} (app killed or reloaded mid-download)`
      );
      writeRunning(null);
    }
  }, []);

  // Backgrounding, freezing and coming back, with how far a running download had got.
  useEffect(() => {
    const note = (ev: string) => () => {
      const p = progressRef.current;
      const bytes = downloadingRef.current && p ? `, download at ${formatBytes(p.bytes)}` : '';
      log(`Event ${ev} (visibility: ${document.visibilityState}${bytes})`);
    };
    const doc: [string, () => void][] = [
      ['visibilitychange', note('visibilitychange')],
      ['freeze', note('freeze')],
      ['resume', note('resume')],
    ];
    const win: [string, () => void][] = [
      ['pagehide', note('pagehide')],
      ['pageshow', note('pageshow')],
      ['online', note('online')],
      ['offline', note('offline')],
    ];
    doc.forEach(([e, h]) => document.addEventListener(e, h));
    win.forEach(([e, h]) => window.addEventListener(e, h));
    return () => {
      doc.forEach(([e, h]) => document.removeEventListener(e, h));
      win.forEach(([e, h]) => window.removeEventListener(e, h));
    };
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Storage test</h1>
        <Link to="/debug" className={styles.link}>
          Player log
        </Link>
      </div>
      <p className={styles.note}>
        Tries large offline audio on this device. Everything is logged at the bottom and kept after a reload.
      </p>
      <EnvSection workerSync={workerSync} onWorkerSync={setWorkerSync} />
      <DownloadSection
        workerSync={workerSync}
        onProgress={(p) => (progressRef.current = p)}
        onRunning={(on) => {
          downloadingRef.current = on;
          if (!on) refreshRows();
        }}
      />
      <StoredSection version={rowsVersion} onChanged={refreshRows} />
      <LogSection />
    </main>
  );
}

// ── 1. Environment ─────────────────────────────────────────────────────────────

const yes = (b: boolean) => (b ? 'yes' : 'no');

function EnvSection({ workerSync, onWorkerSync }: { workerSync: boolean | null; onWorkerSync: (ok: boolean) => void }) {
  const [features, setFeatures] = useState<Features | null>(null);
  const [estimate, setEstimate] = useState<string>('?');
  const [persisted, setPersisted] = useState<string>('?');
  const [workerInfo, setWorkerInfo] = useState('not checked');

  const check = useCallback(async () => {
    let f: Features;
    try {
      f = currentFeatures();
    } catch (e) {
      log('Feature detection failed', e);
      return;
    }
    setFeatures(f);
    log('Environment', f);
    if (f.estimate) {
      try {
        const e = await navigator.storage.estimate();
        const text = `${formatBytes(e.usage)} used of ${formatBytes(e.quota)}`;
        setEstimate(text);
        log(`storage.estimate: ${text}`, e);
      } catch (e) {
        setEstimate(err(e));
        log('storage.estimate failed', e);
      }
    }
    if (f.persisted) {
      try {
        const p = await navigator.storage.persisted();
        setPersisted(String(p));
        log(`storage.persisted: ${p}`);
      } catch (e) {
        setPersisted(err(e));
        log('storage.persisted failed', e);
      }
    }
    if (f.worker && f.opfs) {
      let client: ReturnType<typeof startWorker> | null = null;
      try {
        client = startWorker();
        const r = await Promise.race([
          client.call({ op: 'probe', dir: [OPFS_DIR] }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No answer in 10 s')), 10_000)),
        ]);
        const ok = !!r.info?.startsWith('createSyncAccessHandle works');
        setWorkerInfo(r.info ?? 'answered');
        onWorkerSync(ok);
        log(`Worker probe: ${r.info}`);
      } catch (e) {
        setWorkerInfo(err(e));
        onWorkerSync(false);
        log('Worker probe failed', e);
      } finally {
        client?.terminate();
      }
    } else {
      setWorkerInfo('no Worker or no OPFS');
      onWorkerSync(false);
    }
  }, [onWorkerSync]);

  useEffect(() => {
    const id = setTimeout(() => void check(), 0);
    return () => clearTimeout(id);
  }, [check]);

  const persist = async () => {
    if (typeof navigator.storage?.persist !== 'function') return log('storage.persist is missing');
    try {
      const r = await navigator.storage.persist();
      log(`storage.persist() answered ${r}`);
      setPersisted(String(r));
    } catch (e) {
      log('storage.persist failed', e);
    }
  };

  const items = features
    ? [
        { label: 'User agent', value: features.userAgent },
        { label: 'Installed (standalone)', value: yes(features.standalone) },
        { label: 'Storage used', value: estimate },
        { label: 'Persisted', value: persisted },
        { label: 'OPFS (getDirectory)', value: yes(features.opfs) },
        { label: 'createWritable', value: yes(features.createWritable) },
        {
          label: 'Sync access handle in a worker',
          value: `${workerSync === null ? '…' : yes(workerSync)} (${workerInfo})`,
        },
        { label: 'Cache Storage', value: yes(features.cacheStorage) },
        { label: 'IndexedDB', value: yes(features.indexedDB) },
        { label: 'Media Session', value: yes(features.mediaSession) },
        { label: 'Service worker in control', value: yes(features.serviceWorkerControlled) },
        { label: 'Device memory', value: features.deviceMemory === null ? 'not shown' : `${features.deviceMemory} GB` },
        {
          label: 'JS heap',
          value: features.jsHeap
            ? `${formatBytes(features.jsHeap.used)} of ${formatBytes(features.jsHeap.limit)}`
            : 'not shown',
        },
      ]
    : [];

  return (
    <SectionCard title="Environment">
      <DetailList items={items} className={styles.details} />
      <div className={styles.bar}>
        <PillButton onClick={() => void check()}>Check again</PillButton>
        <PillButton onClick={() => void persist()}>Ask to persist storage</PillButton>
      </div>
    </SectionCard>
  );
}

// ── 2. Download ────────────────────────────────────────────────────────────────

interface TestItem {
  id: string;
  updatedAt: number;
  media: { metadata: { title: string }; tracks?: Track[]; audioFiles?: Track[] };
}

const LARGEST = 'largest';
const COMMITS = [
  { value: String(100 * 1024 * 1024), label: 'Every 100 MB' },
  { value: String(25 * 1024 * 1024), label: 'Every 25 MB' },
  { value: '0', label: 'Only at the end' },
];

function DownloadSection({
  workerSync,
  onProgress,
  onRunning,
}: {
  workerSync: boolean | null;
  onProgress: (p: Progress) => void;
  onRunning: (on: boolean) => void;
}) {
  const [libraryId, setLibraryId] = useState('');
  const [itemId, setItemId] = useState('');
  const [ino, setIno] = useState(LARGEST);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [chosenBackend, setBackend] = useState<Backend | ''>('');
  const [commitEvery, setCommitEvery] = useState(COMMITS[0]?.value ?? '0');
  const [progress, setProgress] = useState<(Progress & { elapsed: number }) | null>(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const lastPaint = useRef(0);

  const libraries = useQuery({
    queryKey: ['storageTest', 'libraries'],
    queryFn: async () => bookLibraries((await absFetch<{ libraries: Library[] }>('/api/libraries')).libraries),
  });
  const library = libraryId || libraries.data?.[0]?.id || '';
  const items = useQuery({
    queryKey: ['storageTest', 'items', library],
    enabled: !!library,
    queryFn: async () =>
      (
        await absFetch<{ results: { id: string; media: { metadata: { title: string } } }[] }>(
          `/api/libraries/${library}/items?limit=500&sort=media.metadata.title&minified=1`
        )
      ).results,
  });
  const book = itemId || items.data?.[0]?.id || '';
  const item = useQuery({
    queryKey: ['storageTest', 'item', book],
    enabled: !!book,
    queryFn: () => absFetch<TestItem>(`/api/items/${encodeURIComponent(book)}?expanded=1`),
  });
  const tracks = useMemo(() => item.data?.media.tracks ?? item.data?.media.audioFiles ?? [], [item.data]);
  const track = ino === LARGEST ? largestTrack(tracks) : tracks.find((t) => t.ino === ino);

  const features = useMemo(() => {
    try {
      return currentFeatures();
    } catch {
      return null;
    }
  }, []);
  const backends = features ? availableBackends(features, workerSync) : [];
  const backend = chosenBackend && backends.includes(chosenBackend) ? chosenBackend : defaultBackend(backends);

  const start = async () => {
    if (!item.data || !track || !backend) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    onRunning(true);
    setProgress(null);
    try {
      await download({
        backend,
        itemId: item.data.id,
        title: item.data.media.metadata.title,
        updatedAt: item.data.updatedAt,
        track,
        endpoint,
        commitEvery: Number(commitEvery),
        signal: ctl.signal,
        log,
        onProgress: (p) => {
          onProgress(p);
          const now = performance.now();
          if (now - lastPaint.current > 250 || p.bytes === p.total) {
            lastPaint.current = now;
            setProgress({ ...p, elapsed: now - p.startedAt });
          }
        },
      });
    } catch (e) {
      log('Download crashed', e);
    } finally {
      setRunning(false);
      onRunning(false);
      abort.current = null;
    }
  };

  const elapsed = progress?.elapsed ?? 0;

  return (
    <SectionCard title="Download">
      <div className={styles.form}>
        <Select
          label="Library"
          value={library}
          onChange={setLibraryId}
          options={(libraries.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
        />
        <Select
          label={`Book${items.isPending && library ? ' (loading…)' : ''}`}
          value={book}
          onChange={(v) => {
            setItemId(v);
            setIno(LARGEST);
          }}
          options={(items.data ?? []).map((i) => ({ value: i.id, label: i.media.metadata.title }))}
        />
        <Select
          label="File"
          value={ino}
          onChange={setIno}
          options={[
            { value: LARGEST, label: `Largest file${largestTrack(tracks) ? '' : ' (none yet)'}` },
            ...tracks.map((t) => ({
              value: t.ino,
              label: `${t.index}. ${t.metadata?.filename ?? t.ino} (${formatBytes(t.metadata?.size)})`,
            })),
          ]}
        />
        <TextField
          label="Endpoint"
          hint="{id} and {ino} are filled in. Try /api/items/{id}/file/{ino} if this one answers 403."
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Select
          label="Store in"
          value={backend ?? ''}
          onChange={(v) => setBackend(v as Backend)}
          options={backends.map((b) => ({ value: b, label: BACKEND_LABELS[b] }))}
        />
        {backend === 'opfs-writable' && (
          <Select label="Commit the file" value={commitEvery} onChange={setCommitEvery} options={COMMITS} />
        )}
      </div>
      {(libraries.error || items.error || item.error) && (
        <p className={styles.note}>Couldn&apos;t load: {err(libraries.error ?? items.error ?? item.error)}</p>
      )}
      {track && (
        <p className={styles.note}>
          {track.metadata?.filename} · {formatBytes(track.metadata?.size)} · {track.mimeType ?? '?'} · ino {track.ino}
        </p>
      )}
      <div className={styles.bar}>
        <PillButton variant="primary" disabled={running || !track || !backend} onClick={() => void start()}>
          Download (resumes a partial file)
        </PillButton>
        <PillButton disabled={!running} onClick={() => abort.current?.abort()}>
          Stop
        </PillButton>
      </div>
      {progress && (
        <>
          <ProgressBar
            value={progress.total ? progress.bytes / progress.total : 0}
            label="Download progress"
            showEmpty
          />
          <p className={styles.mono} role="status">
            {formatBytes(progress.bytes)} of {formatBytes(progress.total)} · {formatRate(progress.received, elapsed)} ·{' '}
            {(elapsed / 1000).toFixed(1)} s
          </p>
        </>
      )}
    </SectionCard>
  );
}

// ── 3 and 4. What's stored, and playing it ────────────────────────────────────

const AUDIO_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'durationchange',
  'canplay',
  'canplaythrough',
  'playing',
  'pause',
  'waiting',
  'stalled',
  'suspend',
  'seeking',
  'seeked',
  'ended',
  'emptied',
  'abort',
  'error',
];

/** 0.1 s of silence, played inside the tap so iOS lets the real source play after the awaits that follow. */
function silentWav(): string {
  const n = 800;
  const b = new Uint8Array(44 + n).fill(0x80);
  const v = new DataView(b.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
}

/** An object URL for a stored copy, typed for <audio>, with how long each step took logged. */
async function objectUrlFor(row: Row): Promise<{ url: string; type: string }> {
  const t0 = performance.now();
  const blob = await storedBlob(row);
  const t1 = performance.now();
  const type = row.meta?.mimeType ?? playMime(undefined, row.name);
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const t2 = performance.now();
  log(
    `Play ${row.backend}/${row.name}: got ${blob.constructor.name} of ${formatBytes(blob.size)} (type "${blob.type}") in ${Math.round(t1 - t0)} ms; ` +
      `object URL with type ${type} in ${Math.round(t2 - t1)} ms`
  );
  return { url, type };
}

function StoredSection({ version, onChanged }: { version: number; onChanged: () => void }) {
  const player = usePlayer();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [current, setCurrent] = useState<Row | null>(null);
  const [useSource, setUseSource] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null);
  const seekRef = useRef<{ target: number; at: number } | null>(null);
  const currentRef = useRef<Row | null>(null);
  const engineItem = useRef(player.item);
  useEffect(() => {
    engineItem.current = player.item;
  }, [player.item]);

  useEffect(() => {
    let live = true;
    listStored((where, e) => log(`${where} failed`, e))
      .then((r) => {
        if (!live) return;
        setRows(r);
        log(
          `Stored: ${r.length ? r.map((x) => `${x.backend}/${x.name} ${x.present ? formatBytes(x.size) : 'MISSING'}`).join('; ') : 'nothing'}`
        );
      })
      .catch((e: unknown) => log('Listing stored copies failed', e));
    return () => {
      live = false;
    };
  }, [version]);

  // The test's own element: every event logged, and the lock screen pointed at it while it plays.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
    const position = () => {
      if (!ms || !Number.isFinite(a.duration) || a.duration <= 0) return;
      try {
        ms.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: 1 });
      } catch (e) {
        log('setPositionState failed', e);
      }
    };
    const claimLockScreen = () => {
      const row = currentRef.current;
      if (!ms || !row) return;
      try {
        const m = row.meta;
        ms.metadata = new MediaMetadata({
          title: m?.title ?? row.name,
          artist: `Storage test · ${row.backend}`,
          album: m?.filename ?? '',
          artwork: m
            ? [
                {
                  src: new URL(coverUrl(m.itemId, m.updatedAt, 512), location.href).href,
                  sizes: '512x512',
                  type: 'image/webp',
                },
              ]
            : [],
        });
      } catch (e) {
        log('Media Session metadata failed', e);
      }
      const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
        ['play', () => (log('Lock screen: play'), void a.play().catch((e: unknown) => log('play() failed', e)))],
        ['pause', () => (log('Lock screen: pause'), a.pause())],
        [
          'seekbackward',
          (d) => {
            log(`Lock screen: seekbackward ${d.seekOffset ?? 15}`);
            a.currentTime = Math.max(0, a.currentTime - (d.seekOffset ?? 15));
          },
        ],
        [
          'seekforward',
          (d) => {
            log(`Lock screen: seekforward ${d.seekOffset ?? 30}`);
            a.currentTime = Math.min(a.duration || Infinity, a.currentTime + (d.seekOffset ?? 30));
          },
        ],
        [
          'seekto',
          (d) => {
            log(`Lock screen: seekto ${d.seekTime}`);
            if (d.seekTime != null) a.currentTime = d.seekTime;
          },
        ],
      ];
      for (const [action, h] of handlers) {
        try {
          ms.setActionHandler(action, h);
        } catch (e) {
          log(`setActionHandler(${action}) failed`, e);
        }
      }
      position();
    };
    const onEvent = (ev: Event) => {
      // Between a tap and its copy loading, the element plays a moment of silence to unlock it (iOS): not worth logging.
      if (!currentRef.current) return;
      const t = ev.type;
      const at = `t=${a.currentTime.toFixed(1)}`;
      if (t === 'error') {
        const me = a.error;
        log(`audio error code ${me?.code ?? '?'} ${me?.message ?? ''}`);
      } else if (t === 'loadedmetadata' || t === 'durationchange') {
        log(`audio ${t} duration ${a.duration}`);
      } else if (t === 'seeked' && seekRef.current) {
        const s = seekRef.current;
        seekRef.current = null;
        log(
          `audio seeked to ${a.currentTime.toFixed(1)} (asked ${s.target.toFixed(1)}) in ${Math.round(performance.now() - s.at)} ms`
        );
      } else {
        log(`audio ${t} ${at} readyState ${a.readyState}`);
      }
      if (t === 'playing') {
        claimLockScreen();
        if (ms) ms.playbackState = 'playing';
      }
      if (t === 'pause' && ms && currentRef.current) ms.playbackState = 'paused';
      if (t === 'seeked' || t === 'loadedmetadata') position();
    };
    AUDIO_EVENTS.forEach((e) => a.addEventListener(e, onEvent));
    return () => {
      AUDIO_EVENTS.forEach((e) => a.removeEventListener(e, onEvent));
      a.pause();
      a.removeAttribute('src');
      a.replaceChildren();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      // Give the lock screen back: our handlers off, and the main player's book (if any) shown again. The engine puts
      // its own handlers back when it next plays or the page wakes.
      if (ms && currentRef.current) {
        for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as const) {
          try {
            ms.setActionHandler(action, null);
          } catch {
            // Unknown action.
          }
        }
        try {
          updateMetadata(engineItem.current, '');
        } catch {
          // No Media Session metadata here.
        }
      }
    };
  }, []);

  const play = async (row: Row) => {
    const a = audioRef.current;
    if (!a) return;
    // Inside the tap, before any await: unlock the element (iOS) and pause the main player.
    a.replaceChildren();
    a.src = silentWav();
    a.play().catch(() => undefined);
    if (player.status === 'playing') {
      log('Pausing the main player first');
      player.toggle();
    }
    currentRef.current = null;
    setCurrent(row);
    try {
      const { url, type } = await objectUrlFor(row);
      log(`Playing via ${useSource ? '<source>' : 'audio.src'}`);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      currentRef.current = row;
      a.pause();
      if (useSource) {
        a.removeAttribute('src');
        const s = document.createElement('source');
        s.src = url;
        s.type = type;
        a.replaceChildren(s);
        a.load();
      } else {
        a.src = url;
      }
      await a.play();
      log('play() resolved');
    } catch (e) {
      log(`Play ${row.backend}/${row.name} failed`, e);
    }
  };

  const seekTo = (fraction: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return log(`Seek ${fraction * 100}%: no duration yet`);
    const target = a.duration * fraction;
    seekRef.current = { target, at: performance.now() };
    log(`Seek to ${Math.round(fraction * 100)}% (${target.toFixed(1)} s)`);
    try {
      a.currentTime = target;
    } catch (e) {
      log('Seek failed', e);
    }
  };

  const remove = async (row: Row) => {
    try {
      await deleteStored(row);
      log(`Deleted ${row.backend}/${row.name}`);
    } catch (e) {
      log(`Deleting ${row.backend}/${row.name} failed`, e);
    }
    onChanged();
  };

  const removeAll = async () => {
    audioRef.current?.pause();
    const failures = await deleteAll();
    log(failures.length ? `Delete all: some parts failed: ${failures.join('; ')}` : 'Deleted all test data');
    onChanged();
  };

  return (
    <SectionCard title="Stored copies" sub="Check here after a reboot, or days later.">
      {rows === null ? (
        <p className={styles.note}>Looking…</p>
      ) : rows.length === 0 ? (
        <p className={styles.note}>Nothing stored.</p>
      ) : (
        <ul className={styles.rows}>
          {rows.map((r) => (
            <li key={r.key} className={styles.row}>
              <p className={styles.rowTitle}>{r.meta?.title ?? r.name}</p>
              <p className={styles.mono}>
                {BACKEND_LABELS[r.backend]} · {r.name}
                <br />
                {r.present ? formatBytes(r.size) : 'MISSING from storage'} of {formatBytes(r.meta?.expected)}
                {r.meta && !r.meta.complete ? ' · partial' : ''}
                <br />
                Stored {time(r.meta?.storedAt)}
                {r.lastModified ? ` · modified ${time(r.lastModified)}` : ''}
              </p>
              <div className={styles.bar}>
                <PillButton icon="play" disabled={!r.present} onClick={() => void play(r)}>
                  Play
                </PillButton>
                <PillButton variant="danger" onClick={() => void remove(r)}>
                  Delete
                </PillButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.bar}>
        <PillButton onClick={onChanged}>Refresh</PillButton>
        <PillButton variant="danger" onClick={() => void removeAll()}>
          Delete all test data
        </PillButton>
      </div>
      <div className={styles.player}>
        <p className={styles.note}>{current ? `Loaded: ${current.backend}/${current.name}` : 'Nothing loaded.'}</p>
        <audio ref={audioRef} controls playsInline preload="auto" className={styles.audio} />
        <div className={styles.bar}>
          <PillButton onClick={() => seekTo(0.25)}>25%</PillButton>
          <PillButton onClick={() => seekTo(0.5)}>50%</PillButton>
          <PillButton onClick={() => seekTo(0.9)}>90%</PillButton>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={useSource} onChange={(e) => setUseSource(e.target.checked)} />
          Play through a &lt;source&gt; element instead of audio.src
        </label>
      </div>
    </SectionCard>
  );
}

// ── Log ────────────────────────────────────────────────────────────────────────

const SHOWN = 300;

function copyFallback(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.className = styles.offscreen ?? '';
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

function LogSection() {
  const entries = useStorageLog();
  const [note, setNote] = useState('');
  const shown = useMemo(() => entries.slice(-SHOWN).reverse(), [entries]);

  const copy = async () => {
    const text = formatLog(entries);
    try {
      await navigator.clipboard.writeText(text);
      setNote(`Copied ${entries.length} lines.`);
    } catch {
      setNote(copyFallback(text) ? `Copied ${entries.length} lines.` : "Couldn't copy. Select the text below instead.");
    }
  };

  return (
    <SectionCard title="Log" sub={`Newest first. ${entries.length} lines kept; Copy gives them all, oldest first.`}>
      <div className={styles.bar}>
        <PillButton variant="primary" onClick={() => void copy()}>
          Copy log
        </PillButton>
        <PillButton
          onClick={() => {
            storageLog.clear();
            setNote('Cleared.');
          }}
        >
          Clear log
        </PillButton>
      </div>
      <p className={styles.note} role="status">
        {note}
      </p>
      <pre className={styles.log}>{shown.map((e) => `${e.t.slice(11, 23)} ${e.msg}`).join('\n')}</pre>
    </SectionCard>
  );
}
