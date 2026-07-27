import { Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import { CallbackPage } from './auth/CallbackPage';
import { Layout } from './components/Layout';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';
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
            <LoginPage />
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
