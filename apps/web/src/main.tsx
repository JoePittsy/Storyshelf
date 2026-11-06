import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/manrope';
import '@joepittsy/ui/styles.css';
import './app.css';
import { App } from './App';

const queryClient = new QueryClient();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="page-scale app">
          <App />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
