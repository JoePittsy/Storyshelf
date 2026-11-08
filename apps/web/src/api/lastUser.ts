/**
 * A small copy of the signed-in user, kept on the device so that offline the app still knows who is signed in. Only
 * what the screens show or check; never a token. Tied to the server it came from.
 */
import { getMode, getServerUrl } from './server';
import type { AbsUser } from './types';

const KEY = 'storyshelf.lastUser';

export type RememberedUser = Pick<AbsUser, 'id' | 'username' | 'type' | 'permissions' | 'librariesAccessible'>;

interface Stored extends RememberedUser {
  server: string;
}

/** Which server this is: the hosted address, or the app's own origin in same-origin mode. */
export const serverKey = (): string => (getMode() === 'hosted' ? `hosted:${getServerUrl() ?? ''}` : 'same-origin');

export function rememberUser(user: AbsUser): void {
  const { id, username, type, permissions, librariesAccessible } = user;
  const stored: Stored = { id, username, type, permissions, librariesAccessible, server: serverKey() };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked: offline, the app will ask to sign in instead.
  }
}

/** The user last signed in on this server, or null. */
export function rememberedUser(): RememberedUser | null {
  let s: Partial<Stored> | null;
  try {
    s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
  } catch {
    return null;
  }
  if (!s || typeof s.id !== 'string' || typeof s.username !== 'string' || s.server !== serverKey()) return null;
  return {
    id: s.id,
    username: s.username,
    type: s.type,
    permissions: s.permissions,
    librariesAccessible: s.librariesAccessible,
  };
}

export function forgetUser(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
