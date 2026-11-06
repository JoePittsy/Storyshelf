// Only the ABS response shapes Storyshelf uses.
export interface MediaProgress {
  id: string;
  libraryItemId: string;
  episodeId?: string | null;
  duration: number;
  progress: number;
  currentTime: number;
  isFinished: boolean;
  lastUpdate: number;
  /** ms since the epoch; ABS 2.37 sends both. */
  startedAt?: number;
  finishedAt?: number | null;
  hideFromContinueListening?: boolean;
}

export interface AbsUser {
  id: string;
  username: string;
  type?: string;
  /** Short-lived JWT; held in memory only. */
  accessToken: string;
  /** Never read: the refresh token lives in ABS's httpOnly cookie. */
  refreshToken?: string | null;
  /** Legacy non-expiring token; ignored. */
  token?: string;
  mediaProgress?: MediaProgress[];
  permissions?: Record<string, boolean>;
  librariesAccessible?: string[];
}

export interface LoginResponse {
  user: AbsUser;
  userDefaultLibraryId?: string;
  serverSettings?: Record<string, unknown>;
}

export interface RefreshResponse {
  user: AbsUser;
}

export interface ServerStatus {
  serverVersion: string;
  authMethods: string[];
  isInit: boolean;
}
