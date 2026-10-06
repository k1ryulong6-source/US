import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';

export default function Me() {
  const { session, profile, isGuest, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [bindStep, setBindStep] = useState<'email' | 'code' | 'done'>('email');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setName(profile.display_name);
  }, [profile]);

  if (!session || !profile) return null;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() })
      .eq('id', session!.user.id);
    setError(error ? t.common.somethingWrong : null);
    setNameSaved(!error);
    if (!error) await refreshProfile();
  }

  async function sendBindCode(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) return setError(error.status === 429 ? t.login.rateLimited : t.common.somethingWrong);
    setError(null);
    setBindStep('code');
  }

  async function verifyBindCode(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email_change',
    });
    if (error) return setError(t.login.invalidCode);
    setError(null);
    setBindStep('done');
  }

  async function signOut() {
    if (isGuest && !window.confirm(t.me.signOutGuestWarn)) return;
    await supabase.auth.signOut();
  }

  return (
    <div className="stack-lg">
      <h1 className="title">{t.me.title}</h1>

      <form onSubmit={saveName} className="stack-sm">
        <label className="field">
          <span>{t.me.nameLabel}</span>
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
            }}
          />
        </label>
        {name.trim() && name !== profile.display_name && <button className="secondary">{t.common.save}</button>}
        {nameSaved && <span className="quiet small">{t.common.saved}</span>}
      </form>

      {isGuest && bindStep !== 'done' ? (
        <section className="paper stack-sm">
          <h2 className="subtitle">{t.me.guestTitle}</h2>
          <p className="quiet small">{t.me.guestHint}</p>
          {bindStep === 'email' ? (
            <form onSubmit={sendBindCode} className="stack-sm">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                placeholder={t.login.emailPlaceholder}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="primary">{t.me.bindEmail}</button>
            </form>
          ) : (
            <form onSubmit={verifyBindCode} className="stack-sm">
              <p className="quiet small">{t.me.bindSent(email)}</p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                placeholder={t.login.codeLabel}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="primary">{t.login.verify}</button>
            </form>
          )}
        </section>
      ) : (
        <p className="quiet small">
          {bindStep === 'done' ? t.me.bindDone : t.me.emailLine(session.user.email ?? '')}
        </p>
      )}

      <ErrorNote show={Boolean(error)} text={error ?? undefined} />

      <Link to="/me/kept" className="link">
        {t.me.seenCollection}
      </Link>

      <button className="link" onClick={signOut}>
        {t.me.signOut}
      </button>
    </div>
  );
}
