import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import Wash from '../components/Wash';
import { PencilLoop } from '../components/Pencil';
import { usWash } from '../lib/washes';

interface Preview {
  us_name: string;
  member_names: string[];
  member_colors: string[] | null;
}

export default function Invite() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { ready, session } = useAuth();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept(): Promise<boolean> {
    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
    if (error || !data) return false;
    // Drop the token from history once it has done its job.
    navigate(`/us/${data as string}`, { replace: true });
    return true;
  }

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { data } = await supabase.rpc('invitation_preview', { p_token: token });
      const row = (data as Preview[] | null)?.[0] ?? null;
      // A link I already used still takes me home, as long as I'm a member.
      if (!row && session && (await accept())) return;
      setPreview(row);
    })();
  }, [ready, token]);

  async function enter(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: name.trim() } },
      });
      if (error) {
        setBusy(false);
        return setFailed(true);
      }
    }
    const ok = await accept();
    setBusy(false);
    if (!ok) setFailed(true);
  }

  if (preview === undefined) return <p className="quiet center pad">{t.invite.loading}</p>;
  if (preview === null) return <p className="quiet pre center pad">{t.invite.invalid}</p>;

  const names = preview.member_names.join('、');

  return (
    <div className="page narrow invite-page">
      {/* the people already here, in their colours, and an empty pencilled place kept for you */}
      <div className="invite-paint" aria-hidden="true">
        <Wash className="invite-us" drops={usWash(preview.member_colors ?? [])} seed={1.3} />
        <span className="invite-place">
          <PencilLoop width={84} height={76} seed={token.slice(0, 8)} />
        </span>
      </div>
      <h1 className="page-title">{t.invite.title(preview.us_name)}</h1>
      {names && <p className="quiet center">{t.invite.whoIsHere(names)}</p>}

      <form onSubmit={enter} className="stack form-column">
        {!session && (
          <label className="field">
            <span>{t.invite.nameLabel}</span>
            <input
              required
              maxLength={40}
              value={name}
              placeholder={t.onboarding.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <button className="primary center-self" disabled={busy || (!session && !name.trim())}>
          {busy ? t.invite.entering : t.invite.enter}
        </button>
      </form>

      {!session && (
        <div className="stack-sm form-column">
          <Link className="link center-self" to={`/login?next=${encodeURIComponent(`/i/${token}`)}`}>
            {t.invite.haveAccount}
          </Link>
          <p className="quiet small center">{t.invite.guestNote}</p>
        </div>
      )}
      <ErrorNote show={failed} />
    </div>
  );
}
