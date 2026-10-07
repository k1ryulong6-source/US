import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { IntentionVisibility, MyUsListItem, Prompt } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import { useAuth } from '../lib/auth';
import { colorOf } from '../lib/palette';
import WetDrop from '../components/WetDrop';
import { PencilLoop } from '../components/Pencil';
import ErrorNote from '../components/ErrorNote';

export default function Answer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const promptId = params.get('prompt');
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [spaces, setSpaces] = useState<MyUsListItem[] | null>(null);
  const [usId, setUsId] = useState<string | null>(params.get('us'));
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<IntentionVisibility>('private');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    supabase
      .from('my_us_list')
      .select('*')
      .neq('state', 'closed')
      .order('hidden')
      .order('sort_order')
      .then(({ data }) => {
        const list = (data as MyUsListItem[]) ?? [];
        setSpaces(list);
        if (list.length === 1) setUsId((cur) => cur ?? list[0].id);
      });
    if (promptId) {
      supabase
        .from('prompts')
        .select('id, body, kind')
        .eq('id', Number(promptId))
        .maybeSingle()
        .then(({ data }) => setPrompt((data as Prompt) ?? null));
    }
  }, [promptId]);

  // A "我看见的你" question is answered by writing a seen note.
  useEffect(() => {
    if (prompt?.kind === 'seen' && usId) {
      navigate(`/us/${usId}/seen`, { replace: true, state: { prompt: prompt.body } });
    }
  }, [prompt, usId, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!usId) return;
    setBusy(true);
    const { error } = await supabase.from('intentions').insert({
      us_id: usId,
      body: body.trim(),
      visibility,
      prompt_id: prompt?.id ?? null,
    });
    setBusy(false);
    if (error) return setFailed(true);
    navigate('/intentions', { replace: true, state: { saved: true } });
  }

  if (!spaces) return <p className="quiet center pad">{t.common.loading}</p>;

  return (
    <div className="answer-page">
      <BackLink to="/" />
      {/* the week's question is a drop of your own colour, not yet fallen */}
      <header className="answer-head">
        <WetDrop color={colorOf(session?.user.id ?? '', profile?.color)} size={26} />
        <h1 className="answer-question">{prompt?.body ?? t.intention.noPrompt}</h1>
      </header>

      {spaces.length === 0 ? (
        <p className="note">{t.intention.noUs}</p>
      ) : (
        <form onSubmit={submit} className="stack form-column">
          {spaces.length > 1 && (
            <div className="field">
              <span>{t.intention.pickUs}</span>
              <div className="chips" role="radiogroup">
                {spaces.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={usId === s.id}
                    className={usId === s.id ? 'chip on' : 'chip'}
                    onClick={() => setUsId(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {prompt?.kind !== 'seen' && (
            <>
              {/* what you mean to do is pencilled in until it's done */}
              <label className="field pencilled">
                <PencilLoop width={34} height={24} seed="answer" />
                <span>{t.intention.bodyLabel}</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  required
                  value={body}
                  placeholder={t.intention.bodyPlaceholder}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>

              <div className="stack-sm" role="radiogroup">
                {(['private', 'shared'] as IntentionVisibility[]).map((v) => (
                  <label key={v} className="radio">
                    <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} />
                    <span>
                      {t.intention.visibility[v]}
                      <br />
                      <small className="quiet">{t.intention.visibilityHint[v]}</small>
                    </span>
                  </label>
                ))}
              </div>

              <button className="primary center-self" disabled={busy || !usId || !body.trim()}>
                {t.intention.save}
              </button>
            </>
          )}
        </form>
      )}
      <ErrorNote show={failed} />
    </div>
  );
}
