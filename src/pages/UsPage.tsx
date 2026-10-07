import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { useSignedUrls } from '../lib/useSignedUrls';
import { setCover } from '../lib/media';
import { usColors } from '../lib/palette';
import { CLEAR_WATER } from '../lib/washes';
import { displayName } from '../lib/format';
import { t } from '../strings';
import Timeline from '../components/Timeline';
import { MEMORY_SELECT } from '../lib/memories';
import type { HistoryEntry, Intention, Memory, TimelineIntention } from '../lib/types';
import IntentionItem from '../components/IntentionItem';
import Wash from '../components/Wash';
import WetDrop from '../components/WetDrop';
import PhotoSheet from '../components/PhotoSheet';
import ErrorNote from '../components/ErrorNote';
import { BackChevron, PencilCamera, PencilLoop, PencilPlus } from '../components/Pencil';

export default function UsPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { space, members, missing, reload } = useUs(id);
  const [proposalWaiting, setProposalWaiting] = useState(false);
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [doneTogether, setDoneTogether] = useState<TimelineIntention[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sheet, setSheet] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const today = useRef<HTMLSpanElement>(null);
  const cover = useSignedUrls(space?.cover_path ? [space.cover_path] : []);

  const loadIntentions = useCallback(async () => {
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

  useEffect(() => {
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
    if (!session) return;
    (async () => {
      const { data: pending } = await supabase.from('proposals').select('id').eq('us_id', id).eq('status', 'pending');
      if (!pending?.length) return setProposalWaiting(false);
      const { data: mine } = await supabase
        .from('proposal_responses')
        .select('proposal_id')
        .in('proposal_id', pending.map((p) => p.id));
      setProposalWaiting((mine?.length ?? 0) < pending.length);
    })();
  }, [id, session]);

  const colors = useMemo(
    () => usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me),
    [members, me],
  );

  if (missing) return <Navigate to="/" replace />;
  if (!space) return <p className="quiet center pad">{t.common.loading}</p>;

  const colorOf = (uid: string | null) => (uid && colors.get(uid)) || '#9C9488';
  const together = [colorOf(me), ...members.filter((m) => m.user_id !== me).map((m) => colorOf(m.user_id))];
  const closed = space.state === 'closed';
  const coverUrl = space.cover_path ? cover[space.cover_path] : null;

  async function pickCover(file: File | null) {
    setSheet(false);
    try {
      await setCover(id, file);
      setPhotoFailed(false);
      await reload();
    } catch {
      setPhotoFailed(true);
    }
  }

  return (
    <div className="us-page">
      <div className="topbar">
        <Link to="/" className="icon-link" aria-label={t.common.back}>
          <BackChevron />
        </Link>
        <nav className="topbar-links">
          <Link to={`/us/${space.id}/seen`}>{t.us.seen}</Link>
          <Link to={`/us/${space.id}/about`}>{t.us.aboutShort}</Link>
        </nav>
      </div>

      <header className="us-head">
        <button type="button" className="cover" onClick={() => !closed && setSheet(true)} aria-label={t.photo.cover} disabled={closed}>
          {coverUrl ? (
            <Wash className="cover-wash" drops={CLEAR_WATER} photo={coverUrl} photoK={[0.95, 0.1]} seed={9.1} flow={0.04} />
          ) : (
            <span className="cover-empty">
              <PencilLoop width={64} height={64} seed={`cover-${space.id}`} />
              <PencilCamera size={20} />
            </span>
          )}
        </button>
        <div className="us-head-text">
          <h1 className="us-title">{space.name}</h1>
          <ul className="people">
            {members.map((m) => (
              <li key={m.user_id}>
                <span className="dot" style={{ background: colorOf(m.user_id) }} />
                {m.user_id === me ? t.common.you : displayName(m.profiles?.display_name)}
              </li>
            ))}
          </ul>
        </div>
      </header>
      {space.description && <p className="us-desc pre">{space.description}</p>}
      <ErrorNote show={photoFailed} text={t.photo.failed} />

      {space.state === 'quiet' && <p className="quiet center small">{t.us.quietNote}</p>}
      {space.state === 'closed' && <p className="quiet center small">{t.us.closedNote}</p>}
      {proposalWaiting && (
        <Link to={`/us/${space.id}/about`} className="quiet center small block-link">
          {t.us.proposalWaiting}
        </Link>
      )}

      {/* not painted yet: what we want to do, in pencil above today's drop */}
      {(intentions.length > 0 || !closed) && (
        <section className="plans" aria-label={t.us.together}>
          {intentions.map((i, n) => (
            <div key={i.id} className={`plan ${n % 2 ? 'right' : 'left'}`}>
              <span className="plan-loop">
                <PencilLoop width={64} height={42} seed={i.id} />
              </span>
              <IntentionItem intention={i} me={me} onChange={loadIntentions} />
            </div>
          ))}
          {!closed && (
            <Link to={`/answer?us=${space.id}`} className="plan add" aria-label={t.intention.add}>
              <PencilPlus />
              <span className="quiet small">{t.us.addTogether}</span>
            </Link>
          )}
        </section>
      )}

      {!closed ? (
        <Link to={`/us/${space.id}/m/new`} className="today">
          <span ref={today}>
            <WetDrop color={together.length > 1 ? '#4E9A78' : together[0]} size={24} />
          </span>
          <span className="today-text">
            <span className="small quiet">{t.us.today}</span>
            <span>{t.memory.add}</span>
          </span>
        </Link>
      ) : (
        <span ref={today} className="today" />
      )}

      {memories === null ? null : memories.length + doneTogether.length + history.length === 0 ? (
        <p className="quiet center small">{t.memory.empty}</p>
      ) : (
        <Timeline
          memories={memories}
          intentions={doneTogether}
          history={history}
          colorOf={colorOf}
          together={together}
          head={today}
        />
      )}

      {sheet && (
        <PhotoSheet
          title={t.photo.cover}
          canRemove={Boolean(space.cover_path)}
          onPick={(f) => void pickCover(f)}
          onRemove={() => void pickCover(null)}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}
