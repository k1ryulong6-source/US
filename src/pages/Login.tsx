import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import Wash from '../components/Wash';

function safeNext(raw: string | null): string {
  // Only allow in-app paths.
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

export default function Login() {
  const { session, isGuest } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session && !isGuest) return <Navigate to={next} replace />;

  // No email at all: a guest identity kept in this browser. Can be tied to an email later in Me.
  async function startAsGuest() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) return setError(t.common.somethingWrong);
    navigate(next, { replace: true });
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? t.login.rateLimited : t.common.somethingWrong);
      return;
    }
    setStep('code');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setError(t.login.invalidCode);
    // On success the auth listener updates the session and we redirect above.
  }

  return (
    <div className="page narrow login-page">
      {/* two colours meeting: what US is */}
      <Wash
        className="login-mark"
        drops={[
          { x: -0.25, y: -0.22, r: 0.66, color: '#E2B21F', alpha: 0.85 },
          { x: 0.26, y: 0.27, r: 0.64, color: '#2779BE', alpha: 0.8 },
        ]}
        seed={2.2}
      />
      <h1 className="page-title">{t.login.title}</h1>
      <p className="quiet center small">{t.login.intro}</p>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="stack form-column">
          <label className="field">
            <span>{t.login.emailLabel}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              placeholder={t.login.emailPlaceholder}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? t.login.sending : t.login.sendCode}
          </button>
          {!session && (
            <div className="stack-sm">
              <button type="button" className="link" disabled={busy} onClick={startAsGuest}>
                {t.login.noEmail}
              </button>
              <p className="quiet small">{t.login.noEmailHint}</p>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={verify} className="stack form-column">
          <p className="quiet">{t.login.codeSent(email)}</p>
          <label className="field">
            <span>{t.login.codeLabel}</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? t.login.verifying : t.login.verify}
          </button>
          <button type="button" className="link" onClick={() => setStep('email')}>
            {t.login.changeEmail}
          </button>
        </form>
      )}
      <ErrorNote show={Boolean(error)} text={error ?? undefined} />
    </div>
  );
}
