import { Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import { CallbackPage } from './auth/CallbackPage';
import { Layout } from './components/Layout';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AuditPage } from './pages/AuditPage';
import { GuestHomePage } from './pages/GuestHomePage';
import { MembersPage } from './pages/MembersPage';
import { SegmentsPage } from './pages/SegmentsPage';
import { ToolDetailPage } from './pages/ToolDetailPage';
import { ToolsPage } from './pages/ToolsPage';
import { WorkspaceProvider } from './state/WorkspaceContext';

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
                <Routes>
                  <Route path="/" element={<ToolsPage />} />
                  <Route path="/tools/:toolId" element={<ToolDetailPage />} />
                  <Route path="/segments" element={<SegmentsPage />} />
                  <Route path="/keys" element={<ApiKeysPage />} />
                  <Route path="/audit" element={<AuditPage />} />
                  <Route path="/members" element={<MembersPage />} />
                </Routes>
              </Layout>
            </WorkspaceProvider>
          )
        }
      />
    </Routes>
  );
}
