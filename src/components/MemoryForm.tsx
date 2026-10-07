import { useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { attachMedia, compressImage, MAX_ATTACHMENTS, removeFiles, type PreparedMedia } from '../lib/media';
import { formatDuration, todayIso } from '../lib/format';
import type { DatePrecision, Memory, MemoryMedia } from '../lib/types';
import { t } from '../strings';
import ErrorNote from './ErrorNote';
import MediaView from './MediaView';
import VoiceRecorder from './VoiceRecorder';
import { PencilAlbum, PencilCamera } from './Pencil';

const PRECISIONS: DatePrecision[] = ['day', 'month', 'year'];

interface Props {
  usId: string;
  existing?: Memory;
  initialBody?: string;
  submitLabel?: string;
  onSaved: (memoryId: string, warning?: string) => void;
}

export default function MemoryForm({ usId, existing, initialBody = '', submitLabel, onSaved }: Props) {
  const [body, setBody] = useState(existing?.body ?? initialBody);
  const [date, setDate] = useState(existing?.happened_on ?? todayIso());
  const [precision, setPrecision] = useState<DatePrecision>(existing?.happened_precision ?? 'day');
  const [place, setPlace] = useState(existing?.place ?? '');
  const [kept, setKept] = useState<MemoryMedia[]>(existing?.memory_media ?? []);
  const [removed, setRemoved] = useState<MemoryMedia[]>([]);
  const [added, setAdded] = useState<PreparedMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = kept.length + added.length;

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = MAX_ATTACHMENTS - total;
    if (files.length > room) setError(t.memory.tooMany);
    const prepared: PreparedMedia[] = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      try {
        prepared.push(await compressImage(f));
      } catch {
        setError(t.common.somethingWrong);
      }
    }
    setAdded((a) => [...a, ...prepared]);
  }

  function onVoice(m: PreparedMedia) {
    if (total >= MAX_ATTACHMENTS) return setError(t.memory.tooMany);
    setAdded((a) => [...a, m]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fields = { body: body.trim(), happened_on: date, happened_precision: precision, place: place.trim() };

    let memoryId = existing?.id;
    if (existing) {
      const { error } = await supabase.from('memories').update(fields).eq('id', existing.id);
      if (error) {
        setBusy(false);
        return setError(t.common.somethingWrong);
      }
      if (removed.length) {
        await supabase.from('memory_media').delete().in('id', removed.map((m) => m.id));
        await removeFiles(removed.map((m) => m.storage_path));
      }
    } else {
      const { data, error } = await supabase
        .from('memories')
        .insert({ us_id: usId, ...fields })
        .select('id')
        .single();
      if (error || !data) {
        setBusy(false);
        return setError(t.common.somethingWrong);
      }
      memoryId = data.id as string;
    }

    let failed = false;
    let position = Math.max(0, ...kept.map((m) => m.position + 1));
    for (const item of added) {
      try {
        await attachMedia(usId, memoryId!, item, position++);
      } catch {
        failed = true;
      }
    }
    setBusy(false);
    onSaved(memoryId!, failed ? t.memory.uploadFailed : undefined);
  }

  return (
    <form onSubmit={submit} className="stack memory-form">
      <label className="field">
        <span>{t.memory.bodyLabel}</span>
        <textarea
          rows={6}
          maxLength={10000}
          value={body}
          placeholder={t.memory.bodyPlaceholder}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      <div className="field">
        <span>{t.memory.dateLabel}</span>
        <input type="date" required value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <div className="chips" role="radiogroup">
          {PRECISIONS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={precision === p}
              className={precision === p ? 'chip on' : 'chip'}
              onClick={() => setPrecision(p)}
            >
              {t.memory.precision[p]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>
          {t.memory.placeLabel} <small className="quiet">{t.common.optional}</small>
        </span>
        <input maxLength={120} value={place} placeholder={t.memory.placePlaceholder} onChange={(e) => setPlace(e.target.value)} />
      </label>

      <div className="field">
        <span>{t.memory.photos}</span>
        {kept.length > 0 && (
          <div className="stack-sm">
            <MediaView media={kept} />
            <div className="chips">
              {kept.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setKept((k) => k.filter((x) => x.id !== m.id));
                    setRemoved((r) => [...r, m]);
                  }}
                >
                  {t.memory.removeMedia} {m.kind === 'image' ? `#${i + 1}` : t.memory.voice}
                </button>
              ))}
            </div>
          </div>
        )}
        {added.length > 0 && (
          <div className="pending-media">
            {added.map((m, i) => (
              <div key={m.previewUrl} className="pending-item">
                {m.kind === 'image' ? (
                  <img src={m.previewUrl} alt="" />
                ) : (
                  <span className="quiet small">
                    {t.memory.voice} {m.durationMs ? formatDuration(m.durationMs) : ''}
                  </span>
                )}
                <button type="button" className="link" onClick={() => setAdded((a) => a.filter((_, j) => j !== i))}>
                  {t.memory.removeMedia}
                </button>
              </div>
            ))}
          </div>
        )}
        {total < MAX_ATTACHMENTS && (
          <div className="photo-pick">
            {/* "拍一张" opens the camera directly; the album lets you pick several */}
            <label className="pencil-button">
              <PencilCamera size={30} />
              <span>{t.photo.take}</span>
              <input type="file" accept="image/*" capture="environment" onChange={onPhotos} className="sr-only" />
            </label>
            <label className="pencil-button">
              <PencilAlbum size={30} />
              <span>{t.photo.pick}</span>
              <input type="file" accept="image/*" multiple onChange={onPhotos} className="sr-only" />
            </label>
          </div>
        )}
      </div>

      <div className="field">
        <span>{t.memory.voice}</span>
        <VoiceRecorder onRecorded={onVoice} />
      </div>

      <button className="primary center-self" disabled={busy || (!body.trim() && total === 0)}>
        {busy ? t.memory.saving : (submitLabel ?? t.memory.save)}
      </button>
      <ErrorNote show={Boolean(error)} text={error ?? undefined} />
    </form>
  );
}
