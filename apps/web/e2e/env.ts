import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Where ./e2e/up.sh writes the local ABS's address and the two users' passwords (gitignored). */
const ENV_FILE = resolve(import.meta.dirname, '../../../e2e/.env');

export interface E2EEnv {
  /** The local Audiobookshelf the dev server proxies to. */
  absUrl: string;
  /** The ordinary (non-admin) user every test signs in as. Its listening progress is reset by the suite. */
  username: string;
  password: string;
}

/** KEY=VALUE lines, as init.sh writes them. No quoting, no expansion: not worth a dependency. */
function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** The e2e settings, or an error that says how to get them. Never prints a password. */
export function loadEnv(): E2EEnv {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`e2e/.env is missing (looked for ${ENV_FILE}). Start the local Audiobookshelf first: ./e2e/up.sh`);
  }
  const env = parse(readFileSync(ENV_FILE, 'utf8'));
  const username = env.ABS_E2E_USER2;
  const password = env.ABS_E2E_PASSWORD2;
  if (!username || !password) {
    throw new Error(
      'e2e/.env has no ABS_E2E_USER2 / ABS_E2E_PASSWORD2. Run ./e2e/up.sh (or ./e2e/init.sh) to create them.'
    );
  }
  return { absUrl: (env.ABS_E2E_URL || 'http://localhost:13378').replace(/\/+$/, ''), username, password };
}

/** Fails with a clear message unless the ABS server answers /status. */
export async function assertAbsUp(absUrl: string): Promise<void> {
  try {
    const res = await fetch(`${absUrl}/status`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(
      `Audiobookshelf isn't answering at ${absUrl}/status (${e instanceof Error ? e.message : String(e)}). Start it with ./e2e/up.sh`,
      { cause: e }
    );
  }
}
