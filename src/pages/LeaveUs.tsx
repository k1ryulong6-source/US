import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUs } from '../lib/useUs';
import type { LeaveMode } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import ErrorNote from '../components/ErrorNote';

export default function LeaveUs() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { space, members, missing } = useUs(id);
  const [mode, setMode] = useState<LeaveMode>('keep');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (missing) return <Navigate to="/" replace />;
  if (!space) return <p className="quiet center pad">{t.common.loading}</p>;

  async function leave() {
    setBusy(true);
    const { error } = await supabase.rpc('leave_us', { p_us: id, p_mode: mode });
    setBusy(false);
    if (error) return setFailed(true);
    navigate('/', { replace: true });
  }

  return (
    <div className="stack-lg">
      <BackLink to={`/us/${id}/about`} />
      <h1 className="title">{t.leave.title}</h1>
      <p>{t.leave.intro}</p>
      <p className="quiet small">{t.leave.exportFirst}</p>

      <div className="stack-sm" role="radiogroup">
        <label className="radio paper">
          <input type="radio" name="mode" checked={mode === 'keep'} onChange={() => setMode('keep')} />
          <span>
            {t.leave.keep}
            <br />
            <small className="quiet">{t.leave.keepHint}</small>
          </span>
        </label>
        <label className="radio paper">
          <input type="radio" name="mode" checked={mode === 'remove'} onChange={() => setMode('remove')} />
          <span>
            {t.leave.remove}
            <br />
            <small className="quiet">{t.leave.removeHint}</small>
          </span>
        </label>
      </div>

      {members.length === 1 && <p className="note">{t.leave.lastOne}</p>}

      <button className="secondary danger" disabled={busy} onClick={leave}>
        {t.leave.confirm}
      </button>
      <ErrorNote show={failed} />
    </div>
  );
}
