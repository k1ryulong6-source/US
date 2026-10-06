import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { displayName, presetName } from '../lib/format';
import { t } from '../strings';
import BackLink from '../components/BackLink';

export default function UsPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const { space, members, missing } = useUs(id);
  const [proposalWaiting, setProposalWaiting] = useState(false);

  useEffect(() => {
    if (!id || !session) return;
    (async () => {
      const { data: pending } = await supabase
        .from('proposals')
        .select('id')
        .eq('us_id', id)
        .eq('status', 'pending');
      if (!pending?.length) return setProposalWaiting(false);
      const { data: mine } = await supabase
        .from('proposal_responses')
        .select('proposal_id')
        .in('proposal_id', pending.map((p) => p.id));
      setProposalWaiting((mine?.length ?? 0) < pending.length);
    })();
  }, [id, session]);

  if (missing) return <Navigate to="/" replace />;
  if (!space) return <p className="quiet center pad">{t.common.loading}</p>;

  const me = session?.user.id;
  const meta = [presetName(space.preset_label), space.stage].filter(Boolean).join(' · ');

  return (
    <div className="stack-lg">
      <div className="row between">
        <BackLink to="/" />
        <Link to={`/us/${space.id}/about`} className="link">
          {t.us.about}
        </Link>
      </div>

      <header className="stack-sm">
        <h1 className="title">{space.name}</h1>
        {meta && <p className="quiet">{meta}</p>}
        {space.description && <p className="pre">{space.description}</p>}
      </header>

      {space.state === 'quiet' && <p className="note">{t.us.quietNote}</p>}
      {space.state === 'closed' && <p className="note">{t.us.closedNote}</p>}
      {proposalWaiting && (
        <Link to={`/us/${space.id}/about`} className="note link-note">
          {t.us.proposalWaiting}
        </Link>
      )}

      <section className="stack-sm">
        <h2 className="subtitle">{t.us.members}</h2>
        <ul className="chips">
          {members.map((m) => (
            <li key={m.user_id} className="chip static">
              {m.user_id === me ? t.common.you : displayName(m.profiles?.display_name)}
            </li>
          ))}
        </ul>
      </section>

      <section className="paper">
        <p className="quiet center">{t.us.nothingYet}</p>
      </section>
    </div>
  );
}
