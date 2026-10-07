import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import Wash from '../components/Wash';
import { arrive, forgetParked, formatCode, moveStatus, readParked, takeBack, type Parked } from '../lib/transfer';

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
  const [step, setStep] = useState<'email' | 'code' | 'move'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // moving: this device handed its identity to another one (lib/transfer.ts)
  const [parked, setParked] = useState<Parked | null>(() => readParked());
  const [moved, setMoved] = useState(false);
  const [moveCode, setMoveCode] = useState('');

  useEffect(() => {
    if (!parked) return;
    let alive = true;
    let checking = false;
    async function check() {
      // one check at a time: taking the session back twice would use it twice
      if (!parked || !alive || checking) return;
      checking = true;
      const status = await moveStatus(parked).catch(() => 'waiting' as const);
      if (!alive || status === 'waiting') {
        checking = false;
        return;
      }
      if (status === 'taken') {
        forgetParked();
        setParked(null);
        setMoved(true);
      } else if (status === 'over') {
        const r = await takeBack(parked).catch(() => 'gone' as const);
        setParked(null);
        if (r === 'back') navigate(next, { replace: true });
        else setMoved(true);
      }
    }
    void check();
    const timer = window.setInterval(check, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [parked, navigate, next]);

  if (session && !isGuest) return <Navigate to={next} replace />;

  async function cancelMove() {
    if (!parked) return;
    setBusy(true);
    const r = await takeBack(parked).catch(() => 'gone' as const);
    setBusy(false);
    setParked(null);
    if (r === 'back') navigate(next, { replace: true });
    else setMoved(true);
  }

  async function submitMoveCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await arrive(moveCode);
    setBusy(false);
    if (!ok) return setError(t.move.wrong);
    navigate(next, { replace: true });
  }

  if (parked) {
    const until = new Date(parked.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="page narrow login-page">
        <h1 className="page-title">{t.move.waitingTitle}</h1>
        <p className="quiet center small">{t.move.waitingHint}</p>
        <p className="move-code" aria-label={t.move.codeLabel}>
          {formatCode(parked.code)}
        </p>
        <p className="quiet center small">{t.move.until(until)}</p>
        <button type="button" className="link center-self" disabled={busy} onClick={cancelMove}>
          {t.move.cancel}
        </button>
      </div>
    );
  }

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
      {moved && <p className="center small">{t.move.moved}</p>}

      {step === 'move' ? (
        <form onSubmit={submitMoveCode} className="stack form-column">
          <label className="field">
            <span>{t.move.codeLabel}</span>
            <input
              className="move-input"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              required
              value={moveCode}
              placeholder="ABCD-EFGH"
              onChange={(e) => setMoveCode(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? t.move.arriving : t.move.arrive}
          </button>
          <button type="button" className="link" onClick={() => setStep('email')}>
            {t.common.back}
          </button>
        </form>
      ) : step === 'email' ? (
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
          <button type="button" className="link" disabled={busy} onClick={() => setStep('move')}>
            {t.move.have}
          </button>
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
