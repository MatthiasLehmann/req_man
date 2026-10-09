import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './shared/auth/authStore';
import LoginPage from './shared/auth/LoginPage';
import Layout from './shared/layout/Layout';
// Die Seiten der Features sind lazy – sie werden erst beim Aufruf der Route geladen.
import { DashboardPage } from './features/dashboard';
import { RequirementsPage, LinkingPage, DocumentStructurePage } from './features/editor';
import { TraceabilityPage, MetricsPage, MatrixPage } from './features/trace';
import { AdminPage } from './features/admin';
import { HelpPage } from './features/help';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="requirements/:projectId?" element={<RequirementsPage />} />
        <Route path="traceability/:projectId?" element={<TraceabilityPage />} />
        <Route path="metrics/:projectId?" element={<MetricsPage />} />
        <Route path="matrix/:projectId?" element={<MatrixPage />} />
        <Route path="linking/:projectId?" element={<LinkingPage />} />
        <Route path="document-structure/:projectId?" element={<DocumentStructurePage />} />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
        <Route path="help" element={<HelpPage />} />
      </Route>
    </Routes>
  );
}
