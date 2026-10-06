import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() })
      .eq('id', session.user.id);
    setBusy(false);
    setFailed(Boolean(error));
    if (!error) await refreshProfile();
  }

  return (
    <div className="page narrow pad-top stack">
      <h1 className="title">{t.onboarding.title}</h1>
      <p className="quiet">{t.onboarding.hint}</p>
      <form onSubmit={submit} className="stack">
        <input
          value={name}
          maxLength={40}
          required
          placeholder={t.onboarding.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary" disabled={busy || !name.trim()}>
          {t.onboarding.continue}
        </button>
      </form>
      <ErrorNote show={failed} />
    </div>
  );
}
