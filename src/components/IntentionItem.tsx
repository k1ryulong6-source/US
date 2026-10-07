import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Intention } from '../lib/types';
import { t } from '../strings';

interface Props {
  intention: Intention;
  me: string;
  showUs?: boolean;
  onChange: () => void;
}

export default function IntentionItem({ intention: i, me, showUs, onChange }: Props) {
  const mine = i.author_id === me;

  async function setStatus(status: 'open' | 'let_go') {
    if (status === 'let_go' && !window.confirm(t.intention.letGoConfirm)) return;
    await supabase.rpc('set_intention_status', { p_intention: i.id, p_status: status });
    onChange();
  }

  return (
    <div className="intention">
      <p className="pre intention-body">{i.body}</p>
      <span className="quiet small">
        {[showUs && i.us_spaces ? i.us_spaces.name : '', t.intention.visibility[i.visibility]].filter(Boolean).join(' · ')}
      </span>
      {i.done_note && <p className="quiet pre small">{i.done_note}</p>}
      <div className="row intention-actions">
        {i.status === 'open' && (
          <>
            <Link to={`/intentions/${i.id}/done`} className="link">
              {t.intention.markDone}
            </Link>
            {mine && (
              <button className="link" onClick={() => setStatus('let_go')}>
                {t.intention.letGoAction}
              </button>
            )}
          </>
        )}
        {i.status === 'done' && i.memory_id && (
          <Link to={`/us/${i.us_id}/m/${i.memory_id}`} className="link">
            {t.intention.seeMemory}
          </Link>
        )}
        {i.status === 'let_go' && mine && (
          <button className="link" onClick={() => setStatus('open')}>
            {t.intention.pickUp}
          </button>
        )}
      </div>
    </div>
  );
}
