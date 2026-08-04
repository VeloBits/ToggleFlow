import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import { CallbackPage } from './auth/CallbackPage';
import { Layout } from './components/Layout';
import { FlagDetailPage, FlagsPage } from './features/flags';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AuditPage } from './pages/AuditPage';
import { EnvironmentsPage } from './pages/EnvironmentsPage';
import { GuestHomePage } from './pages/GuestHomePage';
import { HomePage } from './pages/HomePage';
import { MembersPage } from './pages/MembersPage';
import { BillingPage, IntegrationsPage, WebhooksPage } from './pages/PlannedPages';
import { SearchPage } from './pages/SearchPage';
import { SegmentsPage } from './pages/SegmentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkspaceProvider } from './state/WorkspaceContext';

/** `/tools/:toolId` was the detail route before flags got their own name. */
function LegacyFlagRedirect() {
  const { toolId } = useParams<{ toolId: string }>();
  return <Navigate to={`/flags/${toolId}`} replace />;
}

export function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route
        path="*"
        element={
          loading ? (
            <main className="center-page">Loading…</main>
          ) : !user ? (
            // Guests land on the public home page whatever path they asked for;
            // its sign-in carries that path so the deep link survives login.
            <GuestHomePage />
          ) : (
            <WorkspaceProvider>
              <Layout>
                {/*
                  Every path here has a row in nav-items.ts, and every row there
                  has a path here - the two lists are read together, so a nav
                  item that goes nowhere is visible as a missing line.
                */}
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/flags" element={<FlagsPage />} />
                  <Route path="/flags/:flagId" element={<FlagDetailPage />} />
                  <Route path="/segments" element={<SegmentsPage />} />
                  <Route path="/environments" element={<EnvironmentsPage />} />
                  <Route path="/keys" element={<ApiKeysPage />} />
                  <Route path="/audit" element={<AuditPage />} />
                  <Route path="/webhooks" element={<WebhooksPage />} />
                  <Route path="/integrations" element={<IntegrationsPage />} />
                  <Route path="/team" element={<MembersPage />} />
                  <Route path="/billing" element={<BillingPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  {/* Pre-refactor paths, kept so existing bookmarks survive. */}
                  <Route path="/members" element={<Navigate to="/team" replace />} />
                  <Route path="/tools/:toolId" element={<LegacyFlagRedirect />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </WorkspaceProvider>
          )
        }
      />
    </Routes>
  );
}
