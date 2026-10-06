import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { displayName, formatDate } from '../lib/format';
import type { SeenNote } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import ErrorNote from '../components/ErrorNote';

export default function SeenNotes() {
  const { id = '' } = useParams();
  const prompt = (useLocation().state as { prompt?: string } | null)?.prompt;
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { space, members, missing } = useUs(id);
  const [notes, setNotes] = useState<SeenNote[]>([]);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [to, setTo] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [given, setGiven] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [n, k] = await Promise.all([
      supabase.from('seen_notes').select('*').eq('us_id', id).order('created_at', { ascending: false }),
      supabase.from('seen_note_keeps').select('note_id'),
    ]);
    setNotes((n.data as SeenNote[]) ?? []);
    setKept(new Set((k.data ?? []).map((r) => r.note_id as string)));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (missing) return <Navigate to="/" replace />;
  if (!space) return <p className="quiet center pad">{t.common.loading}</p>;

  const others = members.filter((m) => m.user_id !== me);
  const nameOf = (uid: string) =>
    displayName(members.find((m) => m.user_id === uid)?.profiles?.display_name ?? t.perspective.someone);
  const toMe = notes.filter((n) => n.to_id === me);
  const fromMe = notes.filter((n) => n.from_id === me);
  const target = to ?? (others.length === 1 ? others[0].user_id : null);
  const closed = space.state === 'closed';

  async function give(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    const { error } = await supabase.from('seen_notes').insert({ us_id: id, to_id: target, body: body.trim() });
    setFailed(Boolean(error));
    if (!error) {
      setBody('');
      setGiven(true);
      await load();
    }
  }

  async function toggleKeep(noteId: string) {
    const { error } = kept.has(noteId)
      ? await supabase.from('seen_note_keeps').delete().eq('note_id', noteId)
      : await supabase.from('seen_note_keeps').insert({ note_id: noteId });
    setFailed(Boolean(error));
    await load();
  }

  async function takeBack(noteId: string) {
    if (!window.confirm(t.seen.takeBackConfirm)) return;
    const { error } = await supabase.from('seen_notes').delete().eq('id', noteId);
    setFailed(Boolean(error));
    await load();
  }

  return (
    <div className="stack-lg">
      <BackLink to={`/us/${id}`} />
      <header className="stack-sm">
        <h1 className="title">{t.seen.title}</h1>
        {prompt && <p className="question-body">{prompt}</p>}
        <p className="quiet">{t.seen.intro}</p>
      </header>

      {!closed &&
        (others.length === 0 ? (
          <p className="note">{t.seen.nobody}</p>
        ) : (
          <form onSubmit={give} className="stack-sm">
            {others.length > 1 && (
              <div className="field">
                <span>{t.seen.to}</span>
                <div className="chips" role="radiogroup">
                  {others.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      role="radio"
                      aria-checked={target === m.user_id}
                      className={target === m.user_id ? 'chip on' : 'chip'}
                      onClick={() => setTo(m.user_id)}
                    >
                      {displayName(m.profiles?.display_name)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {target && others.length === 1 && <span className="quiet small">{t.seen.toWhom(nameOf(target))}</span>}
            <textarea
              rows={4}
              maxLength={2000}
              value={body}
              placeholder={t.seen.placeholder}
              onChange={(e) => {
                setBody(e.target.value);
                setGiven(false);
              }}
            />
            <button className="primary self-start" disabled={!target || !body.trim()}>
              {t.seen.give}
            </button>
            {given && <span className="quiet small">{t.seen.given}</span>}
          </form>
        ))}

      <section className="stack-sm">
        <h2 className="subtitle">{t.seen.toMe}</h2>
        {toMe.length === 0 && <p className="quiet small">{t.seen.noneToMe}</p>}
        {toMe.map((n) => (
          <div key={n.id} className="paper stack-sm note-card">
            <span className="quiet small">
              {t.seen.from(nameOf(n.from_id))} · {formatDate(n.created_at)}
            </span>
            <p className="pre">{n.body}</p>
            <button className="link" onClick={() => toggleKeep(n.id)}>
              {kept.has(n.id) ? t.seen.kept : t.seen.keep}
            </button>
          </div>
        ))}
      </section>

      {fromMe.length > 0 && (
        <section className="stack-sm">
          <h2 className="subtitle">{t.seen.fromMe}</h2>
          {fromMe.map((n) => (
            <div key={n.id} className="stack-sm perspective">
              <span className="quiet small">
                {t.seen.toWhom(nameOf(n.to_id))} · {formatDate(n.created_at)}
              </span>
              <p className="pre">{n.body}</p>
              {!closed && (
                <button className="link" onClick={() => takeBack(n.id)}>
                  {t.seen.takeBack}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <ErrorNote show={failed} />
    </div>
  );
}
