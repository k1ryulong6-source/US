import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Intention } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import ErrorNote from '../components/ErrorNote';
import MemoryForm from '../components/MemoryForm';
import { useUs } from '../lib/useUs';
import { usColors } from '../lib/palette';
import { pool } from '../lib/washes';
import Wash from '../components/Wash';
import { PencilLoop } from '../components/Pencil';

export default function IntentionDone() {
  const { iid = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [intention, setIntention] = useState<Intention | null | undefined>(undefined);
  const [mode, setMode] = useState<'choose' | 'memory' | 'note'>('choose');
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const { members } = useUs(intention?.us_id);

  useEffect(() => {
    supabase
      .from('intentions')
      .select('*, us_spaces(name)')
      .eq('id', iid)
      .maybeSingle()
      .then(({ data }) => setIntention((data as Intention) ?? null));
  }, [iid]);

  if (intention === undefined) return <p className="quiet center pad">{t.common.loading}</p>;
  if (!intention || intention.status !== 'open') return <Navigate to="/intentions" replace />;

  const canNote = intention.visibility === 'private' && intention.author_id === session?.user.id;
  const me = session?.user.id ?? '';
  const colors = usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me);
  const together = [colors.get(me), ...members.filter((m) => m.user_id !== me).map((m) => colors.get(m.user_id))].filter(
    Boolean,
  ) as string[];

  async function complete(memoryId: string | null, text: string | null, goTo: string) {
    const { error } = await supabase.rpc('complete_intention', {
      p_intention: iid,
      p_memory: memoryId,
      p_note: text,
    });
    if (error) return setFailed(true);
    navigate(goTo, { replace: true });
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    await complete(null, note.trim() || null, '/intentions');
  }

  return (
    <div className="done-page">
      <BackLink to="/intentions" />
      {/* what was pencilled in gets painted */}
      <div className="new-place" aria-hidden="true">
        <PencilLoop width={170} height={150} seed={intention.id} />
        {together.length > 0 && <Wash className="new-place-paint" drops={pool(together)} grow={0.5} seed={2.7} />}
      </div>
      <header className="page-head">
        <h1 className="page-title">{t.done.title}</h1>
        <p className="pre done-body">{intention.body}</p>
        <p className="quiet small">{t.done.intro}</p>
      </header>

      {mode === 'choose' && (
        <div className="stack done-choices">
          <button className="primary" onClick={() => setMode('memory')}>
            {t.done.asMemory}
          </button>
          {canNote && (
            <button className="secondary" onClick={() => setMode('note')}>
              {t.done.asNote}
            </button>
          )}
          <button className="link quiet center-self" onClick={() => complete(null, null, '/intentions')}>
            {t.done.nothing}
          </button>
        </div>
      )}

      {mode === 'memory' && (
        <div className="stack-sm">
          <p className="quiet small">{t.done.asMemoryHint}</p>
          <MemoryForm
            usId={intention.us_id}
            onSaved={(mid) => complete(mid, null, `/us/${intention.us_id}/m/${mid}`)}
          />
        </div>
      )}

      {mode === 'note' && (
        <form onSubmit={saveNote} className="stack-sm">
          <p className="quiet small">{t.intention.visibilityHint.private}</p>
          <textarea
            rows={4}
            maxLength={2000}
            value={note}
            placeholder={t.done.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="primary center-self">{t.done.saveNote}</button>
        </form>
      )}
      <ErrorNote show={failed} />
    </div>
  );
}
