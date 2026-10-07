import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { UsPreset } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import { useAuth } from '../lib/auth';
import { colorOf } from '../lib/palette';
import Wash from '../components/Wash';
import { PencilLoop } from '../components/Pencil';
import ErrorNote from '../components/ErrorNote';
import PresetPicker from '../components/PresetPicker';

export default function CreateUs() {
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const mine = colorOf(session?.user.id ?? '', profile?.color);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [preset, setPreset] = useState<UsPreset | null>(null);
  const [stage, setStage] = useState('');
  const [stageSince, setStageSince] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_us', {
      p_name: name.trim(),
      p_description: description.trim(),
      p_preset: preset,
      p_stage: stage.trim() || null,
      p_stage_since: stageSince || null,
    });
    setBusy(false);
    if (error || !data) {
      setFailed(true);
      return;
    }
    navigate(`/us/${data as string}/about`, { replace: true });
  }

  return (
    <div className="create-page">
      <BackLink to="/" />
      <h1 className="sr-only">{t.createUs.title}</h1>
      {/* a new place, drawn in pencil; your colour is the first one in it */}
      <div className="new-place" aria-hidden="true">
        <PencilLoop width={210} height={190} seed="new-place" />
        <Wash className="new-place-paint" drops={[{ x: -0.1, y: 0.05, r: 0.5, color: mine, alpha: 0.88 }]} grow={0.5} seed={5.5} />
      </div>
      <p className="new-place-name">{name.trim() || t.createUs.title}</p>
      <form onSubmit={submit} className="stack form-column">
        <label className="field">
          <span>{t.createUs.nameLabel}</span>
          <input
            required
            maxLength={60}
            value={name}
            placeholder={t.createUs.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t.createUs.descLabel}</span>
          <textarea
            rows={3}
            maxLength={500}
            value={description}
            placeholder={t.createUs.descPlaceholder}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="field">
          <span>{t.createUs.presetLabel}</span>
          <PresetPicker value={preset} onChange={setPreset} />
        </div>
        <label className="field">
          <span>
            {t.createUs.stageLabel} <small className="quiet">{t.common.optional}</small>
          </span>
          <input
            maxLength={40}
            value={stage}
            placeholder={t.createUs.stagePlaceholder}
            onChange={(e) => setStage(e.target.value)}
          />
        </label>
        {stage.trim() && (
          <label className="field">
            <span>
              {t.createUs.stageSinceLabel} <small className="quiet">{t.common.optional}</small>
            </span>
            <input type="date" value={stageSince} onChange={(e) => setStageSince(e.target.value)} />
          </label>
        )}
        <p className="quiet small">{t.createUs.soloNote}</p>
        <button className="primary center-self" disabled={busy || !name.trim()}>
          {t.createUs.submit}
        </button>
      </form>
      <ErrorNote show={failed} />
    </div>
  );
}
