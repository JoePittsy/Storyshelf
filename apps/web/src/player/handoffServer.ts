// What a hand-off check asks ABS (checked against 2.37.2). Neither route is under /api/libraries, so ABS's per-user
// GET cache (ApiCacheManager) never answers them: each one reads the server's progress as it is now.
import { absFetch } from '../api/auth';
import type { ListeningSession } from '../api/history';
import { getProgress } from './bookProgress';
import type { ServerPlace } from './handoff';

/** GET /api/me/progress/:libraryItemId: the book's place as the server has it now, or null when it has none. */
export async function serverPlace(libraryItemId: string): Promise<ServerPlace | null> {
  const p = await getProgress(libraryItemId);
  return p && { currentTime: p.currentTime, lastUpdate: p.lastUpdate ?? 0, isFinished: p.isFinished };
}

/**
 * GET /api/me/item/listening-sessions/:libraryItemId: the book's latest sessions, last updated first, each with the
 * `deviceInfo` of the device that played it. Only what ABS has saved: it saves an open session at each sync once the
 * session has listening time.
 */
export async function recentSessions(libraryItemId: string): Promise<ListeningSession[]> {
  const page = await absFetch<{ sessions?: ListeningSession[] }>(
    `/api/me/item/listening-sessions/${encodeURIComponent(libraryItemId)}?itemsPerPage=10&page=0`,
  );
  return page.sessions ?? [];
}
