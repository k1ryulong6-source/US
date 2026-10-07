import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { displayName, formatDate } from '../lib/format';
import type { SeenNote } from '../lib/types';
import { t } from '../strings';
import { Link } from 'react-router-dom';
import { usColors } from '../lib/palette';
import Wash from '../components/Wash';
import { BackChevron, PencilLoop } from '../components/Pencil';
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
  const colors = useMemo(
    () => usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me),
    [members, me],
  );

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
  // each note carries a small fleck of its writer's colour
  const fleck = (uid: string, seed: number) => (
    <Wash
      className="fleck note-fleck"
      drops={[
        { x: 0, y: 0, r: 0.78, color: colors.get(uid) ?? '#9C9488', alpha: 0.9, aspect: 1.15, angle: -0.5 },
        { x: 0.95, y: 0.75, r: 0.2, color: colors.get(uid) ?? '#9C9488', alpha: 0.85 },
      ]}
      seed={seed}
      flow={0.05}
    />
  );

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
    <div className="seen-page">
      <div className="topbar">
        <Link to={`/us/${id}`} className="icon-link" aria-label={t.common.back}>
          <BackChevron />
        </Link>
      </div>
      <header className="page-head">
        <h1 className="page-title">{t.seen.title}</h1>
        <p className="page-sub">{space.name}</p>
        {prompt && <p className="question-body">{prompt}</p>}
        <p className="quiet">{t.seen.intro}</p>
      </header>

      {!closed &&
        (others.length === 0 ? (
          <p className="note">{t.seen.nobody}</p>
        ) : (
          <form onSubmit={give} className="seen-note seen-write">
            <PencilLoop width={30} height={26} seed={`seen-${id}`} />
            <div className="seen-note-text">
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
            </div>
          </form>
        ))}

      <section className="stack-sm">
        <h2 className="subtitle">{t.seen.toMe}</h2>
        {toMe.length === 0 && <p className="quiet small">{t.seen.noneToMe}</p>}
        {toMe.map((n, i) => (
          <div key={n.id} className="seen-note">
            {fleck(n.from_id, i * 1.3 + 1.1)}
            <div className="seen-note-text">
              <p className="pre">{n.body}</p>
              <div className="row between">
                <span className="quiet small">
                  {t.seen.from(nameOf(n.from_id))} · {formatDate(n.created_at)}
                </span>
                <button className={kept.has(n.id) ? 'link quiet' : 'link'} onClick={() => toggleKeep(n.id)}>
                  {kept.has(n.id) ? t.seen.kept : t.seen.keep}
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {fromMe.length > 0 && (
        <section className="stack-sm">
          <h2 className="subtitle">{t.seen.fromMe}</h2>
          {fromMe.map((n, i) => (
            <div key={n.id} className="seen-note">
              {fleck(me, i * 1.3 + 3.7)}
              <div className="seen-note-text">
                <p className="pre">{n.body}</p>
                <div className="row between">
                  <span className="quiet small">
                    {t.seen.toWhom(nameOf(n.to_id))} · {formatDate(n.created_at)}
                  </span>
                  {!closed && (
                    <button className="link quiet" onClick={() => takeBack(n.id)}>
                      {t.seen.takeBack}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
      <ErrorNote show={failed} />
    </div>
  );
}
