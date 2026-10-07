import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { displayName, formatDate, presetName, todayIso } from '../lib/format';
import { useSignedUrls } from '../lib/useSignedUrls';
import { usColors } from '../lib/palette';
import type { Drop } from '../lib/watercolour';
import type { Invitation, Member, Proposal, ProposalKind, UsPreset, UsState } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import Wash from '../components/Wash';
import WetDrop from '../components/WetDrop';
import Sheet from '../components/Sheet';
import { PencilMore } from '../components/Pencil';
import ErrorNote from '../components/ErrorNote';
import PresetPicker from '../components/PresetPicker';

const STATES: UsState[] = ['active', 'quiet', 'closed'];
/** A proposal nobody declines takes effect after 14 days (see settle_proposals). */
const quietUntil = (createdAt: string) => new Date(new Date(createdAt).getTime() + 14 * 864e5).toISOString();
type SheetKind = ProposalKind | 'invite' | 'more';

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

/**
 * Everyone's colour in one wash, set in a ring so each runs into its neighbours; nobody sits
 * in the middle. Each also leaves a fleck of their colour beside the next person.
 * Photos soak in on top, where someone has one.
 */
function Portrait({
  members,
  colors,
  avatars,
  me,
}: {
  members: Member[];
  colors: Map<string, string>;
  avatars: Record<string, string>;
  me?: string;
}) {
  const n = Math.max(members.length, 1);
  const size = Math.max(58, 150 - 9 * n);
  // adjacent drops overlap by about a third
  const ring = n === 1 ? 0 : n === 2 ? size * 0.34 : (size * 0.34) / Math.sin(Math.PI / n);
  const named = n <= 8;
  const half = ring + size / 2 + (named ? 34 : 6);
  const at = (i: number) => {
    const a = n === 2 ? Math.PI * i : -Math.PI / 2 + 0.35 + (i / n) * Math.PI * 2;
    return { dx: Math.cos(a), dy: Math.sin(a) };
  };
  const colorAt = (i: number) => colors.get(members[i].user_id) ?? '#9C9488';

  // one wash the size of the portrait: positions in units of its half-height
  const drops: Drop[] = members.map((m, i) => {
    const { dx, dy } = at(i);
    const photo = Boolean(m.profiles?.avatar_path);
    return { x: (dx * ring) / half, y: (dy * ring) / half, r: (size * 0.31) / half, color: colorAt(i), alpha: photo ? 0.5 : 0.85 };
  });
  if (n >= 2) {
    members.slice(0, 12).forEach((_, i) => {
      const { dx, dy } = at((i + 1) % n);
      const out = ring + size * 0.36;
      drops.push({
        x: (dx * out + dy * size * 0.12) / half,
        y: (dy * out - dx * size * 0.12) / half,
        r: (size * 0.055) / half,
        color: colorAt(i),
        alpha: 0.9,
        aspect: 2.3,
        angle: Math.atan2(dy, dx) + 1.2,
      });
    });
  }

  return (
    <div className="portrait" style={{ height: half * 2 }} aria-label={t.us.members}>
      <Wash className="portrait-wash" style={{ width: half * 2, height: half * 2 }} drops={drops} seed={3.7} flow={0.06} />
      {members.map((m, i) => {
        const { dx, dy } = at(i);
        const url = m.profiles?.avatar_path ? avatars[m.profiles.avatar_path] : null;
        const name = m.user_id === me ? t.common.you : displayName(m.profiles?.display_name);
        const out = ring + size * 0.4 + 14;
        return (
          <div key={m.user_id}>
            {url && (
              <Wash
                className="portrait-photo"
                style={{ width: size, height: size, left: `calc(50% + ${dx * ring - size / 2}px)`, top: half + dy * ring - size / 2 }}
                drops={[{ x: 0, y: 0, r: 0.62, color: colorAt(i), alpha: 0.75 }]}
                photo={url}
                seed={i * 2.3 + 1}
                flow={0.04}
              />
            )}
            {named && (
              <span
                className="portrait-name"
                style={{
                  left: `calc(50% + ${n === 1 ? 0 : dx * out}px)`,
                  top: n === 1 ? half + size * 0.45 + 12 : half + dy * out,
                }}
              >
                {name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A word written in pencil: it can be changed. Without an action it is just ink. */
function Pencilled({ onClick, label, children }: { onClick?: () => void; label: string; children: ReactNode }) {
  if (!onClick) return <span className="ink-word">{children}</span>;
  return (
    <button type="button" className="pencilled-word" onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
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
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);

  // the proposal being written in a sheet
  const [pName, setPName] = useState('');
  const [pPreset, setPPreset] = useState<UsPreset | null>(null);
  const [pStage, setPStage] = useState('');
  const [pStageDate, setPStageDate] = useState(todayIso());
  const [pState, setPState] = useState<UsState>('quiet');

  const loadExtras = useCallback(async () => {
    if (!id || !me) return;
    const [inv, prop, prefs] = await Promise.all([
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
      supabase.from('my_us_prefs').select('hidden').eq('us_id', id).maybeSingle(),
    ]);
    setInvites((inv.data as Invitation[]) ?? []);
    const pending = (prop.data as Proposal[]) ?? [];
    setProposals(pending);
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
  const activeState: UsState = stateChoices.includes(pState) ? pState : stateChoices[0];
  const pendingKinds = new Set(proposals.map((p) => p.kind));
  const can = (k: ProposalKind) => !pendingKinds.has(k) && (!closed || k === 'state');
  const propose = (k: ProposalKind) => (can(k) ? () => setSheet(k) : undefined);

  async function submitProposal(e: FormEvent) {
    e.preventDefault();
    const kind = sheet as ProposalKind;
    const payload =
      kind === 'rename'
        ? { name: pName.trim() }
        : kind === 'relabel'
          ? { preset_label: pPreset }
          : kind === 'stage'
            ? { stage: pStage.trim(), happened_on: pStageDate || null }
            : { state: activeState };
    const ok = await run(() => supabase.rpc('propose', { p_us: id, p_kind: kind, p_payload: payload }));
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
  const names = members.map((m) => nameOf(m.user_id));
  const people =
    names.length <= 1
      ? t.about.letter.onlyYou
      : t.about.letter.people(`${names.slice(0, -1).join('、')}${t.about.letter.and}${names[names.length - 1]}`);
  const preset = presetName(space.preset_label);

  return (
    <div className="about-page">
      <BackLink to={`/us/${id}`}>
        <button type="button" className="icon-link" onClick={() => setSheet('more')} aria-label={t.about.more}>
          <PencilMore />
        </button>
      </BackLink>

      <Portrait members={members} colors={colors} avatars={avatars} me={me} />

      {/* A few handwritten lines; the words in pencil are the ones you can change (together) */}
      <div className="letter">
        <p>
          {t.about.letter.here}「
          <Pencilled onClick={propose('rename')} label={t.about.sheetTitles.rename}>
            <span className="letter-name">{space.name}</span>
          </Pencilled>
          」。
        </p>
        <p>
          {t.about.letter.we}
          <Pencilled onClick={propose('relabel')} label={t.about.sheetTitles.relabel}>
            {preset || t.about.letter.blank}
          </Pencilled>
          ，
        </p>
        <p>
          {t.about.letter.stage}
          <Pencilled onClick={propose('stage')} label={t.about.sheetTitles.stage}>
            {space.stage || t.about.letter.blank}
          </Pencilled>
          。
        </p>
        <p className="letter-gap">{closed ? people.replace(/，$/, '。') : people}</p>
        {!closed && (
          <p>
            {t.about.letter.empty}
            <Pencilled onClick={() => setSheet('invite')} label={t.about.inviteOne}>
              {t.about.letter.aPlace}
            </Pencilled>
            。
          </p>
        )}
        <form onSubmit={saveDescription} className="letter-desc">
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
          {!closed && description !== space.description && <button className="link">{t.common.save}</button>}
          {descSaved && description === space.description && <span className="quiet small">{t.common.saved}</span>}
        </form>
      </div>

      {/* What is waiting for everyone: a wet drop in the colour of whoever asked */}
      {proposals.length > 0 && (
        <section className="waiting-list" aria-label={t.about.waiting}>
          {proposals.map((p) => (
            <div key={p.id} className="waiting">
              <WetDrop color={colors.get(p.proposed_by ?? '') ?? '#9C9488'} size={22} />
              <span className="small quiet">{t.about.proposedBy(nameOf(p.proposed_by))}</span>
              <p>{describeProposal(p)}</p>
              <span className="small quiet">{t.about.quietUntil(formatDate(quietUntil(p.created_at)))}</span>
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

      <ErrorNote show={failed} />

      {sheet === 'more' && (
        <Sheet title={t.about.more} onClose={closeSheet}>
          {can('state') && (
            <button type="button" className="sheet-row" onClick={() => setSheet('state')}>
              {t.about.stateLink[space.state]}
            </button>
          )}
          <button
            type="button"
            className="sheet-row"
            onClick={async () => {
              await run(() => supabase.from('my_us_prefs').update({ hidden: !hidden }).eq('us_id', id).eq('user_id', me!));
              setSheet(null);
            }}
          >
            <span className="sheet-row-text">
              {hidden ? t.about.unhide : t.about.hide}
              {!hidden && <span className="quiet small">{t.about.hideHint}</span>}
            </span>
          </button>
          <Link to={`/us/${id}/leave`} className="sheet-row danger">
            {t.about.leave}
          </Link>
        </Sheet>
      )}

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

      {(sheet === 'rename' || sheet === 'relabel' || sheet === 'stage' || sheet === 'state') && (
        <Sheet title={t.about.sheetTitles[sheet]} onClose={closeSheet}>
          <form onSubmit={submitProposal} className="sheet-body">
            {sheet === 'rename' && (
              <input required maxLength={60} value={pName} placeholder={t.about.newName} onChange={(e) => setPName(e.target.value)} />
            )}
            {sheet === 'relabel' && <PresetPicker value={pPreset} onChange={setPPreset} />}
            {sheet === 'stage' && (
              <>
                <input required maxLength={40} value={pStage} placeholder={t.about.newStage} onChange={(e) => setPStage(e.target.value)} />
                <label className="field">
                  <span>{t.about.stageDate}</span>
                  <input type="date" value={pStageDate} onChange={(e) => setPStageDate(e.target.value)} />
                </label>
              </>
            )}
            {sheet === 'state' && (
              <div className="stack-sm" role="radiogroup" aria-label={t.about.sheetTitles.state}>
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
