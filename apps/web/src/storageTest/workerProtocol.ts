// Messages between the storage test page and opfsWorker.ts.

export type WorkerRequest = { id: number } & (
  | { op: 'probe'; dir: string[] }
  | { op: 'open'; dir: string[]; name: string; truncate: boolean }
  | { op: 'restart' }
  | { op: 'write'; buf: ArrayBuffer }
  | { op: 'close' }
);

export interface WorkerReply {
  id: number;
  ok: boolean;
  /** The file's size after the operation. */
  size: number;
  info?: string;
  error?: string;
}

type Body<R> = R extends unknown ? Omit<R, 'id'> : never;
export type WorkerCall = Body<WorkerRequest>;

/** A promise-per-message client for the worker. */
export class WorkerClient {
  private next = 1;
  private waiting = new Map<number, { resolve: (r: WorkerReply) => void; reject: (e: Error) => void }>();

  constructor(private worker: Worker) {
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const w = this.waiting.get(e.data.id);
      if (!w) return;
      this.waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data);
      else w.reject(new WorkerError(e.data.error ?? 'Worker error'));
    };
    worker.onerror = (e) => {
      const err = new WorkerError(`Worker crashed: ${e.message || 'no message'}`);
      this.waiting.forEach((w) => w.reject(err));
      this.waiting.clear();
    };
  }

  call(msg: WorkerCall, transfer: Transferable[] = []): Promise<WorkerReply> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ ...msg, id }, transfer);
      } catch (e) {
        this.waiting.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  terminate(): void {
    this.worker.terminate();
    const err = new WorkerError('Worker stopped');
    this.waiting.forEach((w) => w.reject(err));
    this.waiting.clear();
  }
}

export class WorkerError extends Error {
  constructor(message: string) {
    super(message);
    // The worker's message already starts with the original error's name.
    this.name = 'WorkerError';
  }
}

export const startWorker = (): WorkerClient =>
  new WorkerClient(new Worker(new URL('./opfsWorker.ts', import.meta.url), { type: 'module' }));
