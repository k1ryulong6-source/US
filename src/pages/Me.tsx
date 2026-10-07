import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import ReminderSettings from '../components/ReminderSettings';
import { disableReminder, isIos, isStandalone } from '../lib/push';
import { setAvatar } from '../lib/media';
import { useSignedUrls } from '../lib/useSignedUrls';
import { colorOf } from '../lib/palette';
import Palette from '../components/Palette';
import { CLEAR_WATER } from '../lib/washes';
import Wash from '../components/Wash';
import PhotoSheet from '../components/PhotoSheet';
import Sheet from '../components/Sheet';
import { startMove } from '../lib/transfer';
import { PencilCamera } from '../components/Pencil';

export default function Me() {
  const { session, profile, isGuest, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [bindStep, setBindStep] = useState<'email' | 'code' | 'done'>('email');
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [moveSheet, setMoveSheet] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveFailed, setMoveFailed] = useState(false);
  const avatar = useSignedUrls(profile?.avatar_path ? [profile.avatar_path] : []);

  useEffect(() => {
    if (profile) setName(profile.display_name);
  }, [profile]);

  if (!session || !profile) return null;
  const mine = colorOf(session.user.id, profile.color);
  const avatarUrl = profile.avatar_path ? avatar[profile.avatar_path] : null;

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

  async function chooseColor(hex: string) {
    const { error } = await supabase.from('profiles').update({ color: hex }).eq('id', session!.user.id);
    setError(error ? t.common.somethingWrong : null);
    if (!error) await refreshProfile();
  }

  async function changeAvatar(file: File | null) {
    setSheet(false);
    try {
      await setAvatar(session!.user.id, file, profile?.avatar_path);
      setError(null);
      await refreshProfile();
    } catch {
      setError(t.photo.failed);
    }
  }

  async function signOut() {
    if (isGuest && !window.confirm(t.me.signOutGuestWarn)) return;
    // This device should not keep reminding the next person who signs in.
    await disableReminder().catch(() => undefined);
    await supabase.auth.signOut();
  }

  return (
    <div className="me-page">
      <h1 className="sr-only">{t.me.title}</h1>
      {/* your colour: it is how you appear in every US */}
      <Wash
        className="me-wash"
        drops={[
          { x: -0.12, y: -0.1, r: 0.66, color: mine, alpha: 0.9 },
          { x: 0.32, y: 0.3, r: 0.4, color: mine, alpha: 0.85 },
        ]}
        seed={1.9}
      />
      <p className="me-name">{profile.display_name}</p>
      <Palette value={mine} onChange={(hex) => void chooseColor(hex)} />
      <p className="center small quiet">{t.me.color}</p>

      <div className="me-list">
        <button type="button" className="me-row" onClick={() => setSheet(true)}>
          <span>{t.photo.avatar}</span>
          <span className="avatar">
            {avatarUrl ? (
              <Wash className="avatar-wash" drops={CLEAR_WATER} photo={avatarUrl} photoK={[0.95, 0.1]} seed={9.9} flow={0.04} />
            ) : (
              <PencilCamera size={22} />
            )}
          </span>
        </button>

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

      <ReminderSettings />

      {isIos() && !isStandalone() && <p className="quiet small">{t.install.hint}</p>}

      <Link to="/me/kept" className="link">
        {t.me.seenCollection}
      </Link>
      <Link to="/me/export" className="link">
        {t.me.export}
      </Link>
      <button type="button" className="link" onClick={() => setMoveSheet(true)}>
        {t.move.title}
      </button>

      <button className="link quiet" onClick={signOut}>
        {t.me.signOut}
      </button>
      </div>

      {moveSheet && (
        <Sheet title={t.move.title} onClose={() => setMoveSheet(false)}>
          <div className="sheet-body">
            <p className="small">{t.move.explain}</p>
            <p className="quiet small">{t.move.explain2}</p>
            <button
              type="button"
              className="primary self-start"
              disabled={moving}
              onClick={async () => {
                setMoving(true);
                setMoveFailed(false);
                try {
                  await startMove();
                } catch {
                  setMoving(false);
                  setMoveFailed(true);
                }
              }}
            >
              {moving ? t.move.starting : t.move.start}
            </button>
            <ErrorNote show={moveFailed} />
          </div>
        </Sheet>
      )}

      {sheet && (
        <PhotoSheet
          title={t.photo.avatar}
          facing="user"
          canRemove={Boolean(profile.avatar_path)}
          onPick={(f) => void changeAvatar(f)}
          onRemove={() => void changeAvatar(null)}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}
