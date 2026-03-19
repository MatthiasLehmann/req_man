import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RequirementsPage from './pages/RequirementsPage';
import TraceabilityPage from './pages/TraceabilityPage';
import MetricsPage from './pages/MetricsPage';
import MatrixPage from './pages/MatrixPage';
import LinkingPage from './pages/LinkingPage';
import AdminPage from './pages/AdminPage';
import HelpPage from './pages/HelpPage';
import DocumentStructurePage from './pages/DocumentStructurePage';
import Layout from './components/layout/Layout';

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
