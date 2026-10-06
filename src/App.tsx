import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { t } from './strings';
import Layout from './components/Layout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import CreateUs from './pages/CreateUs';
import UsPage from './pages/UsPage';
import UsAbout from './pages/UsAbout';
import LeaveUs from './pages/LeaveUs';
import Invite from './pages/Invite';
import Me from './pages/Me';
import MemoryNew from './pages/MemoryNew';
import MemoryDetail from './pages/MemoryDetail';
import MemoryEdit from './pages/MemoryEdit';
import SeenNotes from './pages/SeenNotes';
import SeenCollection from './pages/SeenCollection';
import Answer from './pages/Answer';
import Intentions from './pages/Intentions';
import IntentionDone from './pages/IntentionDone';
import Export from './pages/Export';

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, profile } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="quiet center pad">{t.common.loading}</p>;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (profile && !profile.display_name.trim()) return <Onboarding />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/i/:token" element={<Invite />} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/new" element={<RequireAuth><CreateUs /></RequireAuth>} />
      <Route path="/us/:id" element={<RequireAuth><UsPage /></RequireAuth>} />
      <Route path="/us/:id/about" element={<RequireAuth><UsAbout /></RequireAuth>} />
      <Route path="/us/:id/leave" element={<RequireAuth><LeaveUs /></RequireAuth>} />
      <Route path="/us/:id/m/new" element={<RequireAuth><MemoryNew /></RequireAuth>} />
      <Route path="/us/:id/m/:mid" element={<RequireAuth><MemoryDetail /></RequireAuth>} />
      <Route path="/us/:id/m/:mid/edit" element={<RequireAuth><MemoryEdit /></RequireAuth>} />
      <Route path="/us/:id/seen" element={<RequireAuth><SeenNotes /></RequireAuth>} />
      <Route path="/answer" element={<RequireAuth><Answer /></RequireAuth>} />
      <Route path="/intentions" element={<RequireAuth><Intentions /></RequireAuth>} />
      <Route path="/intentions/:iid/done" element={<RequireAuth><IntentionDone /></RequireAuth>} />
      <Route path="/me/export" element={<RequireAuth><Export /></RequireAuth>} />
      <Route path="/me/kept" element={<RequireAuth><SeenCollection /></RequireAuth>} />
      <Route path="/me" element={<RequireAuth><Me /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
