// Dedicated worker for the storage test: writes OPFS files through createSyncAccessHandle, chunk by chunk, at an
// explicit offset. Each write is in place, so whatever was written before the app was killed stays on disk.
import type { WorkerReply, WorkerRequest } from './workerProtocol';

interface SyncHandle {
  write(buf: BufferSource, opts?: { at?: number }): number;
  read(buf: BufferSource, opts?: { at?: number }): number;
  truncate(size: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
}
type WithSync = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> };

const FLUSH_EVERY = 16 * 1024 * 1024;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(m: WorkerReply): void;
};

let handle: SyncHandle | null = null;
let at = 0;
let sinceFlush = 0;

async function dirFor(path: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory();
  for (const p of path) dir = await dir.getDirectoryHandle(p, { create: true });
  return dir;
}

function closeHandle(): void {
  if (!handle) return;
  try {
    handle.flush();
  } finally {
    handle.close();
    handle = null;
  }
}

async function run(req: WorkerRequest): Promise<Omit<WorkerReply, 'id' | 'ok'>> {
  switch (req.op) {
    case 'probe': {
      const proto = typeof FileSystemFileHandle !== 'undefined' ? FileSystemFileHandle.prototype : null;
      const hasSync = !!proto && 'createSyncAccessHandle' in proto;
      if (!hasSync) return { size: 0, info: 'createSyncAccessHandle missing in worker' };
      const dir = await dirFor(req.dir);
      const fh = (await dir.getFileHandle('probe.bin', { create: true })) as WithSync;
      const h = await fh.createSyncAccessHandle();
      try {
        h.truncate(0);
        h.write(new Uint8Array([1, 2, 3, 4]), { at: 0 });
        const back = new Uint8Array(4);
        h.read(back, { at: 0 });
        if (back[3] !== 4) throw new Error('Read back the wrong bytes');
      } finally {
        h.close();
      }
      await dir.removeEntry('probe.bin');
      return { size: 0, info: 'createSyncAccessHandle works (wrote, read back, removed 4 bytes)' };
    }
    case 'open': {
      closeHandle();
      const dir = await dirFor(req.dir);
      const fh = (await dir.getFileHandle(req.name, { create: true })) as WithSync;
      handle = await fh.createSyncAccessHandle();
      if (req.truncate) handle.truncate(0);
      at = handle.getSize();
      sinceFlush = 0;
      return { size: at };
    }
    case 'restart': {
      if (!handle) throw new Error('No file open');
      handle.truncate(0);
      handle.flush();
      at = 0;
      return { size: 0 };
    }
    case 'write': {
      if (!handle) throw new Error('No file open');
      const bytes = new Uint8Array(req.buf);
      let done = 0;
      while (done < bytes.byteLength) {
        const n = handle.write(bytes.subarray(done), { at: at + done });
        if (n <= 0) throw new Error(`write returned ${n}`);
        done += n;
      }
      at += done;
      sinceFlush += done;
      if (sinceFlush >= FLUSH_EVERY) {
        handle.flush();
        sinceFlush = 0;
      }
      return { size: at };
    }
    case 'close': {
      const size = handle ? handle.getSize() : at;
      closeHandle();
      return { size };
    }
  }
}

scope.onmessage = (e) => {
  const req = e.data;
  run(req).then(
    (r) => scope.postMessage({ id: req.id, ok: true, ...r }),
    (err: unknown) => {
      const x = err as { name?: string; message?: string };
      scope.postMessage({
        id: req.id,
        ok: false,
        size: at,
        error: `${x?.name ?? 'Error'}: ${x?.message ?? String(err)}`,
      });
    }
  );
};
