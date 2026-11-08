// Installing Storyshelf as an app. No browser lets a page open the system's "Add to Home Screen" itself, so:
//   - Chromium (Chrome, Edge, Samsung Internet, Android) fires `beforeinstallprompt`; we keep it and replay it from a
//     button, which opens the browser's real install dialog.
//   - iPhone and iPad have no API at all: the button explains the two taps (Share, then Add to Home Screen).
//   - Safari on a Mac installs from its own menu (File > Add to Dock); we say so.
//   - Anything else (Firefox on a desktop) can't install a web app, so nothing is shown.
import { useSyncExternalStore } from 'react';

/** Chromium's install prompt (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallRoute =
  /** Already running as an installed app: nothing to offer. */
  | 'installed'
  /** The browser's own install dialog is ready to open. */
  | 'prompt'
  /** iPhone or iPad: Share, then Add to Home Screen. */
  | 'ios'
  /** Safari on a Mac: File > Add to Dock. */
  | 'mac-safari'
  /** No way to install from this browser (or Chromium hasn't offered yet). */
  | 'none';

export interface InstallEnv {
  standalone: boolean;
  canPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

/** Which install route this browser has. Pure, for testing. */
export function installRoute(env: InstallEnv): InstallRoute {
  if (env.standalone) return 'installed';
  if (env.canPrompt) return 'prompt';
  const ua = env.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  if (ios) return 'ios';
  const macSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(ua);
  if (macSafari) return 'mac-safari';
  return 'none';
}

/** Whether this browser has anything to show in Settings' App card. */
export const offersInstall = (route: InstallRoute): boolean =>
  route === 'prompt' || route === 'ios' || route === 'mac-safari';

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Call once at boot, before rendering: Chromium fires `beforeinstallprompt` early, often before React mounts, and
 * only once per page load.
 */
export function listenForInstall(target: Window = window): void {
  target.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the browser's own mini-infobar out of the way; the button replays it
    deferred = e as InstallPromptEvent;
    notify();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

const isStandalone = () =>
  installed ||
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = (): InstallRoute =>
  installRoute({
    standalone: isStandalone(),
    canPrompt: deferred !== null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });

/** Opens Chromium's install dialog. The prompt can be used once, so it's dropped either way. */
async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === 'accepted';
}

/** The install route for this browser, kept current as the prompt arrives or the app is installed. */
export function useInstall(): { route: InstallRoute; promptInstall: () => Promise<boolean> } {
  const route = useSyncExternalStore(subscribe, snapshot, () => 'none' as const);
  return { route, promptInstall };
}

export function resetInstallForTests(): void {
  deferred = null;
  installed = false;
  listeners.clear();
}
