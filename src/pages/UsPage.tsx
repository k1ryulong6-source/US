import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { displayName, presetName } from '../lib/format';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import Timeline from '../components/Timeline';
import { MEMORY_SELECT } from '../lib/memories';
import type { HistoryEntry, Intention, Memory, TimelineIntention } from '../lib/types';
import IntentionItem from '../components/IntentionItem';

export default function UsPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const { space, members, missing } = useUs(id);
  const [proposalWaiting, setProposalWaiting] = useState(false);
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [intentions, setIntentions] = useState<Intention[]>([]);

  const loadIntentions = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('intentions')
      .select('*')
      .eq('us_id', id)
      .eq('status', 'open')
      .order('created_at', { ascending: true });
    setIntentions((data as Intention[]) ?? []);
  }, [id]);

  useEffect(() => {
    void loadIntentions();
  }, [loadIntentions]);

  const [doneTogether, setDoneTogether] = useState<TimelineIntention[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [m, i, h] = await Promise.all([
        supabase.from('memories').select(MEMORY_SELECT).eq('us_id', id),
        supabase
          .from('intentions')
          .select('id, body, done_at, memory_id, created_at')
          .eq('us_id', id)
          .eq('visibility', 'shared')
          .eq('status', 'done'),
        supabase.from('relationship_history').select('id, from_stage, to_stage, happened_on, created_at').eq('us_id', id),
      ]);
      setDoneTogether((i.data as TimelineIntention[]) ?? []);
      setHistory((h.data as HistoryEntry[]) ?? []);
      setMemories((m.data as Memory[]) ?? []);
    })();
  }, [id]);

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

      <div className="row">
        {space.state !== 'closed' && (
          <Link to={`/us/${space.id}/m/new`} className="button primary">
            {t.memory.add}
          </Link>
        )}
        <Link to={`/us/${space.id}/seen`} className="link">
          {t.seen.linkFromUs}
        </Link>
      </div>

      {(intentions.length > 0 || space.state !== 'closed') && (
        <section className="stack-sm">
          {intentions.some((i) => i.visibility === 'shared') && (
            <>
              <h2 className="subtitle">{t.intention.ourPlans}</h2>
              {intentions
                .filter((i) => i.visibility === 'shared')
                .map((i) => (
                  <IntentionItem key={i.id} intention={i} me={me ?? ''} onChange={loadIntentions} />
                ))}
            </>
          )}
          {intentions.some((i) => i.visibility === 'private') && (
            <>
              <h2 className="subtitle">{t.intention.myPrivate}</h2>
              {intentions
                .filter((i) => i.visibility === 'private')
                .map((i) => (
                  <IntentionItem key={i.id} intention={i} me={me ?? ''} onChange={loadIntentions} />
                ))}
            </>
          )}
          {space.state !== 'closed' && (
            <Link to={`/answer?us=${space.id}`} className="link">
              {t.intention.add}
            </Link>
          )}
        </section>
      )}

      {memories === null ? null : memories.length + doneTogether.length + history.length === 0 ? (
        <section className="paper">
          <p className="quiet center">{t.memory.empty}</p>
        </section>
      ) : (
        <Timeline memories={memories} intentions={doneTogether} history={history} />
      )}
    </div>
  );
}
