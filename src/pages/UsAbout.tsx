import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { formatDate, presetName, todayIso } from '../lib/format';
import type { HistoryEntry, Invitation, Proposal, ProposalKind, UsPreset, UsState } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import ErrorNote from '../components/ErrorNote';
import PresetPicker from '../components/PresetPicker';

const STATES: UsState[] = ['active', 'quiet', 'closed'];

function describeProposal(p: Proposal): string {
  const v = p.payload;
  switch (p.kind) {
    case 'rename':
      return t.about.proposalText.rename(v.name ?? '');
    case 'relabel':
      return t.about.proposalText.relabel(presetName((v.preset_label as UsPreset) ?? null) || t.presets.none);
    case 'stage':
      return t.about.proposalText.stage(v.stage ?? '', formatDate(v.happened_on));
    case 'state':
      return t.about.proposalText.state(t.about.stateOptions[(v.state as UsState) ?? 'active']);
  }
}

export default function UsAbout() {
  const { id } = useParams();
  const { session } = useAuth();
  const me = session?.user.id;
  const { space, missing, reload } = useUs(id);

  const [description, setDescription] = useState('');
  const [descSaved, setDescSaved] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [failed, setFailed] = useState(false);

  // new proposal form
  const [kind, setKind] = useState<ProposalKind>('rename');
  const [pName, setPName] = useState('');
  const [pPreset, setPPreset] = useState<UsPreset | null>(null);
  const [pStage, setPStage] = useState('');
  const [pStageDate, setPStageDate] = useState(todayIso());
  const [pState, setPState] = useState<UsState>('quiet');

  const loadExtras = useCallback(async () => {
    if (!id || !me) return;
    const [inv, prop, hist, prefs] = await Promise.all([
      supabase
        .from('invitations')
        .select('id, created_at, expires_at, used_at, revoked_at')
        .eq('us_id', id)
        .is('used_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('proposals')
        .select('*')
        .eq('us_id', id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('relationship_history')
        .select('id, from_stage, to_stage, happened_on, created_at')
        .eq('us_id', id)
        .order('happened_on', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase.from('my_us_prefs').select('hidden').eq('us_id', id).maybeSingle(),
    ]);
    setInvites((inv.data as Invitation[]) ?? []);
    const pending = (prop.data as Proposal[]) ?? [];
    setProposals(pending);
    setHistory((hist.data as HistoryEntry[]) ?? []);
    setHidden(Boolean(prefs.data?.hidden));
    if (pending.length) {
      const { data } = await supabase
        .from('proposal_responses')
        .select('proposal_id')
        .in('proposal_id', pending.map((p) => p.id));
      setAnswered(new Set((data ?? []).map((r) => r.proposal_id as string)));
    } else {
      setAnswered(new Set());
    }
  }, [id, me]);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  useEffect(() => {
    if (space) setDescription(space.description);
  }, [space]);

  if (missing) return <Navigate to="/" replace />;
  if (!space || !id) return <p className="quiet center pad">{t.common.loading}</p>;

  const closed = space.state === 'closed';

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    const { error } = await fn();
    setFailed(Boolean(error));
    await Promise.all([reload(), loadExtras()]);
    return !error;
  }

  async function saveDescription(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      supabase.rpc('set_us_description', { p_us: id, p_description: description.trim() }),
    );
    setDescSaved(ok);
  }

  async function createInvite() {
    const { data, error } = await supabase.rpc('create_invitation', { p_us: id });
    if (error || !data) return setFailed(true);
    setNewLink(`${window.location.origin}/i/${data as string}`);
    setCopied(false);
    void loadExtras();
  }

  async function shareInvite() {
    if (!newLink || !space) return;
    const text = t.about.inviteShareText(space.name);
    if (navigator.share) {
      try {
        await navigator.share({ text, url: newLink });
        return;
      } catch {
        /* user cancelled: fall through to copy */
      }
    }
    await navigator.clipboard.writeText(`${text}${newLink}`);
    setCopied(true);
  }

  async function submitProposal(e: FormEvent) {
    e.preventDefault();
    const payload =
      activeKind === 'rename'
        ? { name: pName.trim() }
        : activeKind === 'relabel'
          ? { preset_label: pPreset }
          : activeKind === 'stage'
            ? { stage: pStage.trim(), happened_on: pStageDate || null }
            : { state: activeState };
    const ok = await run(() =>
      supabase.rpc('propose', { p_us: id, p_kind: activeKind, p_payload: payload }),
    );
    if (ok) {
      setPName('');
      setPStage('');
    }
  }

  const stateChoices = STATES.filter((s) => s !== space.state);
  const pendingKinds = new Set(proposals.map((p) => p.kind));
  const allKinds: ProposalKind[] = closed ? ['state'] : ['rename', 'relabel', 'stage', 'state'];
  const kinds = allKinds.filter((k) => !pendingKinds.has(k));
  // Fall back to a kind / state that is actually offered.
  const activeKind: ProposalKind = kinds.includes(kind) ? kind : kinds[0];
  const activeState: UsState = stateChoices.includes(pState) ? pState : stateChoices[0];

  return (
    <div className="stack-lg">
      <BackLink to={`/us/${id}`} />
      <h1 className="title">{t.about.title}</h1>

      {/* Description: ordinary content, editable by anyone here */}
      <section className="stack-sm">
        <h2 className="subtitle">{t.about.description}</h2>
        <form onSubmit={saveDescription} className="stack-sm">
          <textarea
            rows={3}
            maxLength={500}
            disabled={closed}
            value={description}
            placeholder={t.about.descriptionPlaceholder}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescSaved(false);
            }}
          />
          {!closed && description !== space.description && (
            <button className="secondary">{t.common.save}</button>
          )}
          {descSaved && <span className="quiet small">{t.common.saved}</span>}
        </form>
      </section>

      {/* Invitations */}
      {!closed && (
        <section className="stack-sm">
          <h2 className="subtitle">{t.about.invite}</h2>
          <p className="quiet small">{t.about.inviteHint}</p>
          {newLink ? (
            <div className="paper stack-sm">
              <code className="break">{newLink}</code>
              <div className="row">
                <button className="primary" onClick={shareInvite}>
                  {'share' in navigator ? t.about.share : t.about.copy}
                </button>
                {copied && <span className="quiet small">{t.about.copied}</span>}
              </div>
            </div>
          ) : (
            <button className="secondary" onClick={createInvite}>
              {t.about.createInvite}
            </button>
          )}
          {invites.length > 0 && (
            <details>
              <summary className="quiet small">{t.about.openInvites}</summary>
              <ul className="plain">
                {invites.map((inv) => (
                  <li key={inv.id} className="row between">
                    <span className="small">{t.about.inviteCreatedAt(formatDate(inv.created_at))}</span>
                    <button
                      className="link"
                      onClick={() => run(() => supabase.rpc('revoke_invitation', { p_invitation: inv.id }))}
                    >
                      {t.about.revoke}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* Proposals: relationship-defining changes */}
      <section className="stack-sm">
        <h2 className="subtitle">{t.about.proposals}</h2>
        <p className="quiet small">{t.about.proposalsHint}</p>

        {proposals.map((p) => (
          <div key={p.id} className="paper stack-sm">
            <p>{describeProposal(p)}</p>
            {answered.has(p.id) ? (
              <div className="row between">
                <span className="quiet small">{t.about.waitingOthers}</span>
                {p.proposed_by === me && (
                  <button
                    className="link"
                    onClick={() => run(() => supabase.rpc('withdraw_proposal', { p_proposal: p.id }))}
                  >
                    {t.about.withdraw}
                  </button>
                )}
              </div>
            ) : (
              <div className="row">
                <button
                  className="primary"
                  onClick={() =>
                    run(() => supabase.rpc('respond_to_proposal', { p_proposal: p.id, p_answer: 'accept' }))
                  }
                >
                  {t.about.accept}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    run(() => supabase.rpc('respond_to_proposal', { p_proposal: p.id, p_answer: 'decline' }))
                  }
                >
                  {t.about.decline}
                </button>
              </div>
            )}
          </div>
        ))}

        {kinds.length > 0 && (
          <details>
            <summary className="link">{t.about.newProposal}</summary>
            <form onSubmit={submitProposal} className="stack-sm pad-top-sm">
              <div className="chips" role="radiogroup" aria-label={t.about.proposalKind}>
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={activeKind === k}
                    className={activeKind === k ? 'chip on' : 'chip'}
                    onClick={() => setKind(k)}
                  >
                    {t.about.kinds[k]}
                  </button>
                ))}
              </div>

              {activeKind === 'rename' && (
                <input
                  required
                  maxLength={60}
                  value={pName}
                  placeholder={t.about.newName}
                  onChange={(e) => setPName(e.target.value)}
                />
              )}
              {activeKind === 'relabel' && <PresetPicker value={pPreset} onChange={setPPreset} />}
              {activeKind === 'stage' && (
                <>
                  <input
                    required
                    maxLength={40}
                    value={pStage}
                    placeholder={t.about.newStage}
                    onChange={(e) => setPStage(e.target.value)}
                  />
                  <label className="field">
                    <span>{t.about.stageDate}</span>
                    <input type="date" value={pStageDate} onChange={(e) => setPStageDate(e.target.value)} />
                  </label>
                </>
              )}
              {activeKind === 'state' && (
                <div className="stack-sm" role="radiogroup" aria-label={t.about.newState}>
                  {stateChoices.map((s) => (
                    <label key={s} className="radio">
                      <input type="radio" name="state" checked={activeState === s} onChange={() => setPState(s)} />
                      {t.about.stateOptions[s]}
                    </label>
                  ))}
                </div>
              )}

              <button className="secondary">{t.about.propose}</button>
            </form>
          </details>
        )}
      </section>

      {/* Relationship history */}
      <section className="stack-sm">
        <h2 className="subtitle">{t.about.history}</h2>
        {history.length === 0 ? (
          <p className="quiet small">{t.about.historyEmpty}</p>
        ) : (
          <ol className="plain history">
            {history.map((h) => (
              <li key={h.id}>
                <span className="quiet small">
                  {h.happened_on ? formatDate(h.happened_on) : t.about.historyUnknownDate}
                </span>
                <span>{[h.from_stage, h.to_stage].filter(Boolean).join(' → ')}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Personal: hide, leave */}
      <section className="stack-sm">
        <button
          className="link"
          onClick={() =>
            run(() =>
              supabase
                .from('my_us_prefs')
                .update({ hidden: !hidden })
                .eq('us_id', id)
                .eq('user_id', me!),
            )
          }
        >
          {hidden ? t.about.unhide : t.about.hide}
        </button>
        {!hidden && <p className="quiet small">{t.about.hideHint}</p>}
        <Link to={`/us/${id}/leave`} className="link danger">
          {t.about.leave}
        </Link>
      </section>

      <ErrorNote show={failed} />
    </div>
  );
}
