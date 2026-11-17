import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { initOffline } from './lib/offline';

initOffline();

// Inside the Echo desktop app on macOS the title bar is hidden; see .desktop-mac in index.css.
if (/Electron/.test(navigator.userAgent) && /Mac/.test(navigator.platform)) document.documentElement.classList.add('desktop-mac');

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
