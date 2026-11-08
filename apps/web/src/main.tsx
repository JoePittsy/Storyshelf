import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { ToastProvider } from '@joepittsy/ui';
import '@fontsource-variable/manrope';
import '@joepittsy/ui/styles.css';
import './app.css';
import { App } from './App';
import { detectMode } from './api/server';
import { applyStoredBookColour } from './frame/bookColour';
import { listenForInstall } from './frame/install';

// Chromium offers installing once, early: catch it before anything awaits.
listenForInstall();
// The chosen icon colour's links, before Chromium reads the manifest.
applyStoredBookColour();

// Decide same-origin or hosted before anything builds an ABS URL.
await detectMode();

const queryClient = new QueryClient();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="page-scale app">
          <ToastProvider>
            <App />
          </ToastProvider>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
