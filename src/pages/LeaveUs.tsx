import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { removeFiles } from '../lib/media';
import { supabase } from '../lib/supabase';
import { useUs } from '../lib/useUs';
import type { LeaveMode } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import { useAuth } from '../lib/auth';
import { usColors } from '../lib/palette';
import Wash from '../components/Wash';
import ErrorNote from '../components/ErrorNote';

export default function LeaveUs() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { space, members, missing } = useUs(id);
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [mode, setMode] = useState<LeaveMode>('keep');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (missing) return <Navigate to="/" replace />;
  if (!space) return <p className="quiet center pad">{t.common.loading}</p>;
  const colors = usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me);
  const others = members.filter((m) => m.user_id !== me).map((m) => colors.get(m.user_id) ?? '#9C9488');

  async function leave() {
    setBusy(true);
    const { data, error } = await supabase.rpc('leave_us', { p_us: id, p_mode: mode });
    if (error) {
      setBusy(false);
      return setFailed(true);
    }
    // Others can no longer read these; delete the files themselves too.
    await removeFiles((data as string[] | null) ?? []);
    setBusy(false);
    navigate('/', { replace: true });
  }

  return (
    <div className="leave-page">
      <BackLink to={`/us/${id}/about`} />
      {/* you can go on your own: your drop simply lifts away from the others */}
      <div className="leave-paint" aria-hidden="true">
        {others.length > 0 && (
          <Wash
            className="leave-us"
            drops={others.slice(0, 4).map((c, i) => ({ x: (i % 2) * 0.4 - 0.2, y: Math.floor(i / 2) * 0.4 - 0.15, r: 0.55, color: c, alpha: 0.75 }))}
            seed={3.3}
            strength={0.8}
          />
        )}
        <Wash className="leave-me" drops={[{ x: 0, y: 0, r: 0.6, color: colors.get(me) ?? '#9C9488', alpha: 0.85 }]} seed={6.1} />
      </div>
      <header className="page-head">
        <h1 className="page-title">{t.leave.title}</h1>
        <p className="page-sub">{space.name}</p>
      </header>
      <p className="center">{t.leave.intro}</p>
      <Link to="/me/export" className="link">
        {t.leave.exportFirst}
      </Link>

      <div className="stack-sm" role="radiogroup">
        <label className="radio">
          <input type="radio" name="mode" checked={mode === 'keep'} onChange={() => setMode('keep')} />
          <span>
            {t.leave.keep}
            <br />
            <small className="quiet">{t.leave.keepHint}</small>
          </span>
        </label>
        <label className="radio">
          <input type="radio" name="mode" checked={mode === 'remove'} onChange={() => setMode('remove')} />
          <span>
            {t.leave.remove}
            <br />
            <small className="quiet">{t.leave.removeHint}</small>
          </span>
        </label>
      </div>

      {members.length === 1 && <p className="note">{t.leave.lastOne}</p>}

      <button className="secondary danger center-self" disabled={busy} onClick={leave}>
        {t.leave.confirm}
      </button>
      <ErrorNote show={failed} />
    </div>
  );
}
