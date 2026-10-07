import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import Wash from '../components/Wash';
import WetDrop from '../components/WetDrop';
import { meetingDrops, splashColors } from '../components/Splash';
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
  const [step, setStep] = useState<'start' | 'email' | 'code' | 'move'>('start');
  const colors = useMemo(splashColors, []);
  const go = (next: typeof step) => {
    setError(null);
    setStep(next);
  };
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
      <div className="login">
        <div className="login-head">
          <Wash className="login-mark small" drops={meetingDrops(colors)} seed={2.2} flow={0.05} />
          <h1 className="login-intro">{t.move.waitingTitle}</h1>
        </div>
        <div className="login-body">
          <p className="login-hint">{t.move.waitingHint}</p>
          <p className="move-code" aria-label={t.move.codeLabel}>
            {formatCode(parked.code)}
          </p>
          <p className="login-hint">{t.move.until(until)}</p>
        </div>
        <nav className="login-other">
          <button type="button" className="link quiet" disabled={busy} onClick={cancelMove}>
            {t.move.cancel}
          </button>
        </nav>
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

  async function verify(token: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) {
      setCode('');
      setError(t.login.invalidCode);
    }
    // On success the auth listener updates the session and we redirect above.
  }

  const drop = (label: string, wet = true) => (
    <span className="drop-action-inner">
      {wet && <WetDrop color={colors[0]} size={22} />}
      <span>{label}</span>
    </span>
  );

  return (
    <div className="login">
      {/* the opening's last frame: two colours that have met, and US in ink */}
      <div className="login-head">
        <Wash className="login-mark" drops={meetingDrops(colors)} seed={2.2} flow={0.05} />
        <h1 className="login-word" aria-label={t.login.title}>
          US
        </h1>
        <p className="login-intro">{t.login.intro}</p>
      </div>

      <div className="login-body" key={step}>
        {moved && <p className="center small">{t.move.moved}</p>}

        {step === 'start' && !session && (
          <>
            <button type="button" className="drop-action" disabled={busy} onClick={startAsGuest}>
              {drop(t.login.start)}
            </button>
            <p className="login-hint">{t.login.startHint}</p>
          </>
        )}

        {step === 'email' && (
          <form onSubmit={sendCode} className="login-form">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              aria-label={t.login.emailLabel}
              value={email}
              placeholder={t.login.emailLabel}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="drop-action" disabled={busy}>
              {drop(busy ? t.login.sending : t.login.sendCode)}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={(e) => (e.preventDefault(), void verify(code))} className="login-form">
            <p className="login-hint">{t.login.codeSent(email)}</p>
            <input
              className="code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              aria-label={t.login.codeLabel}
              placeholder="······"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                // six digits is the whole code: go straight in
                if (v.length === 6) void verify(v);
              }}
            />
            {busy && <p className="login-hint">{t.login.verifying}</p>}
          </form>
        )}

        {step === 'move' && (
          <form onSubmit={submitMoveCode} className="login-form">
            <p className="login-hint">{t.move.codeLabel}</p>
            <input
              className="code-input move-input"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              required
              aria-label={t.move.codeLabel}
              value={moveCode}
              placeholder="ABCD-EFGH"
              onChange={(e) => setMoveCode(e.target.value)}
            />
            <button className="drop-action" disabled={busy}>
              {drop(busy ? t.move.arriving : t.move.arrive)}
            </button>
          </form>
        )}

        <ErrorNote show={Boolean(error)} text={error ?? undefined} />
      </div>

      {/* the other ways in, folded away */}
      <nav className="login-other">
        {step === 'start' ? (
          <>
            <button type="button" className="link quiet" onClick={() => go('email')}>
              {t.login.withEmail}
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="link quiet" onClick={() => go('move')}>
              {t.move.have}
            </button>
          </>
        ) : (
          <button type="button" className="link quiet" onClick={() => go(step === 'code' ? 'email' : 'start')}>
            {step === 'code' ? t.login.changeEmail : t.common.back}
          </button>
        )}
      </nav>
    </div>
  );
}
