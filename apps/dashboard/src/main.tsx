import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { THEME_STORAGE_KEYS, VelobitsProvider } from '@velobits-dev/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import './theme.css';
import { ToastProvider } from './ui/toast';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          {/*
           * `VelobitsProvider` is the design system's `ThemeProvider` +
           * `TooltipProvider` in one. It replaces the app's own `initTheme()`
           * call and the bare `TooltipProvider` that used to be mounted here.
           *
           * `THEME_STORAGE_KEYS.dashboard` is `'tf.theme'` — the same key this
           * app has always written, so nobody's stored preference is lost. The
           * provider's `readStoredMode` also tolerates the bare `'dark'` /
           * `'light'` strings this app persisted before it understood `'system'`.
           *
           * The tooltip delay stays at 300ms rather than the system default,
           * because tooltips here live inside table cells where a 0ms delay
           * fires on every pass of the cursor down a column.
           *
           * It also mounts `<MotionConfig reducedMotion="user">`, so every Framer
           * animation in the tree honours the OS setting. The CSS half —
           * transitions and `tw-animate-css` keyframes — is handled by the token
           * layer's own base rule. Neither needs repeating here.
           */}
          <VelobitsProvider storageKey={THEME_STORAGE_KEYS.dashboard} tooltipDelayDuration={300}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </VelobitsProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
