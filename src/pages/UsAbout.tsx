import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { displayName, formatDate, formatMemoryDate, presetName, todayIso } from '../lib/format';
import { useSignedUrls } from '../lib/useSignedUrls';
import { usColors } from '../lib/palette';
import { CLEAR_WATER } from '../lib/washes';
import type { HistoryEntry, Invitation, Proposal, ProposalKind, UsPreset, UsState } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import Wash from '../components/Wash';
import WetDrop from '../components/WetDrop';
import Sheet from '../components/Sheet';
import { PencilLoop, PencilPlus, PencilRule } from '../components/Pencil';
import ErrorNote from '../components/ErrorNote';
import PresetPicker from '../components/PresetPicker';

const STATES: UsState[] = ['active', 'quiet', 'closed'];
const formatMonth = (iso: string) => formatMemoryDate(iso, 'month');
type SheetKind = 'invite' | 'name' | 'stage' | 'state';

function describeProposal(p: Proposal): string {
  const v = p.payload;
  switch (p.kind) {
    case 'rename':
      return t.about.proposalText.rename(v.name ?? '');
    case 'relabel':
      return t.about.proposalText.relabel(presetName((v.preset_label as UsPreset) ?? null) || t.presets.none);
    case 'stage':
      return t.about.proposalText.stage(v.stage ?? '', formatDate(v.happened_on) || t.about.historyUnknownDate);
    case 'state':
      return t.about.proposalText.state(t.about.stateOptions[(v.state as UsState) ?? 'active']);
  }
}

/** The stages in the order they happened: 室友 → 朋友 → 家人, each with the date it began. */
function stageChain(history: HistoryEntry[], current: string | null) {
  const steps: { stage: string; since: string | null }[] = [];
  for (const h of [...history].reverse()) {
    if (!steps.length && h.from_stage) steps.push({ stage: h.from_stage, since: null });
    if (h.to_stage) steps.push({ stage: h.to_stage, since: h.happened_on });
  }
  if (!steps.length && current) steps.push({ stage: current, since: null });
  return steps;
}

export default function UsAbout() {
  const { id } = useParams();
  const { session } = useAuth();
  const me = session?.user.id;
  const { space, members, missing, reload } = useUs(id);
  const avatars = useSignedUrls(members.map((m) => m.profiles?.avatar_path).filter(Boolean) as string[]);
  const colors = useMemo(
    () => usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me),
    [members, me],
  );

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
  const [sheet, setSheet] = useState<SheetKind | null>(null);

  // the proposal being written in a sheet
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

  const closeSheet = useCallback(() => setSheet(null), []);

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

  const stateChoices = STATES.filter((s) => s !== space.state);
  const pendingKinds = new Set(proposals.map((p) => p.kind));
  const can = (k: ProposalKind) => !pendingKinds.has(k) && (!closed || k === 'state');
  const nameKinds = (['rename', 'relabel'] as ProposalKind[]).filter(can);
  // the kind the open sheet is about; the name sheet lets you switch between name and label
  const activeKind: ProposalKind =
    sheet === 'stage' ? 'stage' : sheet === 'state' ? 'state' : nameKinds.includes(kind) ? kind : nameKinds[0];
  const activeState: UsState = stateChoices.includes(pState) ? pState : stateChoices[0];

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
      setSheet(null);
    }
  }

  const nameOf = (uid: string | null) => {
    if (uid === me) return t.common.you;
    return displayName(members.find((m) => m.user_id === uid)?.profiles?.display_name);
  };
  const chain = stageChain(history, space.stage);
  const preset = presetName(space.preset_label);

  return (
    <div className="about-page">
      <BackLink to={`/us/${id}`} />

      {/* The people here, side by side so their colours touch; an empty pencilled place for whoever comes next */}
      <ul className="gathering" aria-label={t.us.members}>
        {members.map((m, i) => {
          const url = m.profiles?.avatar_path ? avatars[m.profiles.avatar_path] : null;
          const color = colors.get(m.user_id) ?? '#9C9488';
          return (
            <li key={m.user_id}>
              {url ? (
                <Wash className="gathering-paint" drops={CLEAR_WATER} photo={url} photoK={[0.95, 0.1]} seed={i * 2.3 + 1} flow={0.04} />
              ) : (
                <Wash
                  className="gathering-paint"
                  drops={[{ x: 0, y: 0, r: 0.56, color, alpha: 0.86 }]}
                  seed={i * 2.3 + 1}
                  flow={0.05}
                />
              )}
              <span className="gathering-name">{m.user_id === me ? t.common.you : displayName(m.profiles?.display_name)}</span>
            </li>
          );
        })}
        {!closed && (
          <li>
            <button type="button" className="gathering-add" onClick={() => setSheet('invite')}>
              <span className="gathering-loop">
                <PencilLoop width={56} height={56} seed={`invite-${id}`} />
                <PencilPlus size={14} />
              </span>
              <span className="gathering-name">{t.about.inviteOne}</span>
            </button>
          </li>
        )}
      </ul>

      {/* Name and words: the name changes only together; the words anyone can rewrite */}
      <header className="about-head">
        {nameKinds.length > 0 ? (
          <button type="button" className="about-name pencilled-under" onClick={() => setSheet('name')} aria-label={t.about.changeName}>
            {space.name}
          </button>
        ) : (
          <h1 className="about-name">{space.name}</h1>
        )}
        <p className="page-sub">{preset ? `${t.about.title} · ${preset}` : t.about.title}</p>
        <form onSubmit={saveDescription} className="about-desc">
          <textarea
            rows={2}
            maxLength={500}
            disabled={closed}
            value={description}
            placeholder={t.about.descriptionPlaceholder}
            aria-label={t.about.descriptionPlaceholder}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescSaved(false);
            }}
          />
          {!closed && description !== space.description && (
            <button className="link center-self">{t.common.save}</button>
          )}
          {descSaved && description === space.description && <span className="quiet small">{t.common.saved}</span>}
        </form>
      </header>

      {/* What is waiting for everyone: a wet drop in the colour of whoever asked */}
      {proposals.length > 0 && (
        <section className="about-block" aria-label={t.about.waiting}>
          <p className="section-label center">{t.about.waiting}</p>
          {proposals.map((p) => (
            <div key={p.id} className="waiting">
              <WetDrop color={colors.get(p.proposed_by ?? '') ?? '#9C9488'} size={22} />
              <span className="small quiet">{t.about.proposedBy(nameOf(p.proposed_by))}</span>
              <p>{describeProposal(p)}</p>
              {answered.has(p.id) ? (
                <div className="row">
                  <span className="quiet small">{t.about.waitingOthers}</span>
                  {p.proposed_by === me && (
                    <button className="link" onClick={() => run(() => supabase.rpc('withdraw_proposal', { p_proposal: p.id }))}>
                      {t.about.withdraw}
                    </button>
                  )}
                </div>
              ) : (
                <div className="row">
                  <button
                    className="primary"
                    onClick={() => run(() => supabase.rpc('respond_to_proposal', { p_proposal: p.id, p_answer: 'accept' }))}
                  >
                    {t.about.accept}
                  </button>
                  <button
                    className="link"
                    onClick={() => run(() => supabase.rpc('respond_to_proposal', { p_proposal: p.id, p_answer: 'decline' }))}
                  >
                    {t.about.decline}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* The stages, one under another on a pencil line; a pencilled plus for the next one */}
      <section className="about-block" aria-label={t.about.history}>
        <p className="section-label center">{t.about.history}</p>
        <ol className="stages">
          {chain.map((s, i) => (
            <li key={i} className={i === chain.length - 1 ? 'now' : undefined}>
              {s.since && <span className="stage-since">{formatMonth(s.since)}</span>}
              <span className="stage-name">{s.stage}</span>
            </li>
          ))}
        </ol>
        {can('stage') && (
          <button type="button" className="stage-add" onClick={() => setSheet('stage')}>
            <PencilPlus size={16} />
            <span>{chain.length ? t.about.changeStage : t.about.historyEmpty}</span>
          </button>
        )}
      </section>

      <PencilRule />

      {/* Only for me, and the way out */}
      <nav className="about-quiet">
        {can('state') && (
          <button type="button" className="link" onClick={() => setSheet('state')}>
            {t.about.stateLink[space.state]}
          </button>
        )}
        <button
          className="link"
          onClick={() =>
            run(() => supabase.from('my_us_prefs').update({ hidden: !hidden }).eq('us_id', id).eq('user_id', me!))
          }
        >
          {hidden ? t.about.unhide : t.about.hide}
        </button>
        {!hidden && <p className="quiet small">{t.about.hideHint}</p>}
        <Link to={`/us/${id}/leave`} className="link danger">
          {t.about.leave}
        </Link>
      </nav>

      <ErrorNote show={failed} />

      {sheet === 'invite' && (
        <Sheet title={t.about.inviteOne} onClose={closeSheet}>
          <div className="sheet-body">
            <p className="quiet small">{t.about.inviteHint}</p>
            {newLink ? (
              <>
                <code className="break invite-link">{newLink}</code>
                <div className="row">
                  <button className="primary" onClick={shareInvite}>
                    {'share' in navigator ? t.about.share : t.about.copy}
                  </button>
                  {copied && <span className="quiet small">{t.about.copied}</span>}
                </div>
              </>
            ) : (
              <button className="primary self-start" onClick={createInvite}>
                {t.about.createInvite}
              </button>
            )}
            {invites.length > 0 && (
              <details>
                <summary className="quiet small">{t.about.openInvites}</summary>
                <ul className="plain pad-top-sm">
                  {invites.map((inv) => (
                    <li key={inv.id} className="row between">
                      <span className="small">{t.about.inviteCreatedAt(formatDate(inv.created_at))}</span>
                      <button className="link" onClick={() => run(() => supabase.rpc('revoke_invitation', { p_invitation: inv.id }))}>
                        {t.about.revoke}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </Sheet>
      )}

      {(sheet === 'name' || sheet === 'stage' || sheet === 'state') && (
        <Sheet
          title={sheet === 'name' ? t.about.changeName : sheet === 'stage' ? t.about.changeStage : t.about.changeState}
          onClose={closeSheet}
        >
          <form onSubmit={submitProposal} className="sheet-body">
            {sheet === 'name' && nameKinds.length > 1 && (
              <div className="chips" role="radiogroup" aria-label={t.about.proposalKind}>
                {nameKinds.map((k) => (
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
            )}
            {activeKind === 'rename' && (
              <input required maxLength={60} value={pName} placeholder={t.about.newName} onChange={(e) => setPName(e.target.value)} />
            )}
            {activeKind === 'relabel' && <PresetPicker value={pPreset} onChange={setPPreset} />}
            {activeKind === 'stage' && (
              <>
                <input required maxLength={40} value={pStage} placeholder={t.about.newStage} onChange={(e) => setPStage(e.target.value)} />
                <label className="field">
                  <span>{t.about.stageDate}</span>
                  <input type="date" value={pStageDate} onChange={(e) => setPStageDate(e.target.value)} />
                </label>
              </>
            )}
            {activeKind === 'state' && (
              <div className="stack-sm" role="radiogroup" aria-label={t.about.changeState}>
                {stateChoices.map((s) => (
                  <label key={s} className="radio">
                    <input type="radio" name="state" checked={activeState === s} onChange={() => setPState(s)} />
                    {t.about.stateOptions[s]}
                  </label>
                ))}
              </div>
            )}
            <p className="quiet small">{t.about.togetherHint}</p>
            <button className="primary self-start">{t.about.propose}</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
