import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BrowserRouter } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';
import '@fontsource-variable/manrope';
import '@joepittsy/ui/styles.css';
import './app.css';
import { App } from './App';
import { onForgetUser, onSessionRenewed, renewSession } from './api/auth';
import { startConnectivity } from './api/connectivity';
import {
  createCachePersister,
  createQueryClient,
  followConnectivity,
  idbStore,
  persistOptions,
} from './api/queryCache';
import { detectMode } from './api/server';
import { applyStoredBookColour } from './frame/bookColour';
import { listenForInstall } from './frame/install';
import { startServiceWorker } from './pwa/serviceWorker';

// Chromium offers installing once, early: catch it before anything awaits.
listenForInstall();
// The chosen icon colour's links, before Chromium reads the manifest.
applyStoredBookColour();

// A new release waiting from last time takes over now, before anything renders (the page reloads onto it).
if (!(await startServiceWorker())) {
  // Decide same-origin or hosted before anything builds an ABS URL.
  await detectMode();
  render();
}

function render() {
  const queryClient = createQueryClient();
  const persister = createCachePersister(idbStore);
  followConnectivity();
  startConnectivity(renewSession);
  // Back online, or a 401 renewed: the session query holds the fresh user.
  onSessionRenewed((user) => queryClient.setQueryData(['session'], user));
  // Signed out, or the server no longer knows the session: the device keeps nothing of the user's.
  onForgetUser(() => void persister.removeClient());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persister.flush();
  });

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');

  createRoot(root).render(
    <StrictMode>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions(persister)}>
        <BrowserRouter>
          <div className="page-scale app">
            <ToastProvider>
              <App />
            </ToastProvider>
          </div>
        </BrowserRouter>
      </PersistQueryClientProvider>
    </StrictMode>
  );
}
