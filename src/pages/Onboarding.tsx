import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { colorOf } from '../lib/palette';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import Palette from '../components/Palette';
import Wash from '../components/Wash';

/** The first time: a name, and the colour you'll be in every US. Your drop lands on wet paper. */
export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => colorOf(session?.user.id ?? ''));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), color })
      .eq('id', session.user.id);
    setBusy(false);
    setFailed(Boolean(error));
    if (!error) await refreshProfile();
  }

  return (
    <div className="page narrow onboarding">
      <Wash
        className="wet-sheet"
        drops={[
          { x: 0, y: 0.02, r: 0.92, color: '#C9C2B4', alpha: 0.22 },
          { x: -0.05, y: -0.02, r: 0.52, color, alpha: 0.9 },
        ]}
        grow={0.45}
        flow={0.06}
        seed={8.1}
      />
      <h1 className="page-title">{t.onboarding.title}</h1>
      <p className="quiet small center">{t.onboarding.hint}</p>
      <form onSubmit={submit} className="stack form-column">
        <input
          value={name}
          maxLength={40}
          required
          aria-label={t.onboarding.title}
          placeholder={t.onboarding.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="stack-sm">
          <Palette value={color} onChange={setColor} />
          <p className="center small quiet">{t.me.colorHint}</p>
        </div>
        <button className="primary center-self" disabled={busy || !name.trim()}>
          {t.onboarding.continue}
        </button>
      </form>
      <ErrorNote show={failed} />
    </div>
  );
}
