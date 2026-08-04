import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { TooltipProvider } from './components/ui/tooltip';
import './theme.css';
import { ToastProvider } from './ui/toast';
import { initTheme } from './ui/theme';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          {/*
           * shadcn's `Tooltip` is a bare Radix Root, so it needs a Provider
           * ancestor - mounted once here rather than per call site, because
           * tooltips live inside table cells and a missing provider fails at
           * render time rather than at build time. Sharing one provider is also
           * what makes the open/close delay consistent across the app.
           */}
          <TooltipProvider delayDuration={300}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </TooltipProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
