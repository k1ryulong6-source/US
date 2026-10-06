import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { removeFiles, uploadPerspectiveAudio, type PreparedMedia } from '../lib/media';
import { displayName, formatDuration } from '../lib/format';
import type { Perspective } from '../lib/types';
import { t } from '../strings';
import AudioClip from './AudioClip';
import ErrorNote from './ErrorNote';
import VoiceRecorder from './VoiceRecorder';

interface Props {
  usId: string;
  memoryId: string;
  me: string;
  closed: boolean;
}

/**
 * "你记得的版本是？" — others' versions stay hidden (by RLS) until I write mine
 * or choose to skip. The UI never hints whether anyone else has written.
 */
export default function Perspectives({ usId, memoryId, me, closed }: Props) {
  const [revealed, setRevealed] = useState<boolean | null>(null);
  const [all, setAll] = useState<Perspective[]>([]);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [rv, ps] = await Promise.all([
      supabase.from('reveal_states').select('memory_id').eq('memory_id', memoryId).maybeSingle(),
      supabase
        .from('perspectives')
        .select('*, profiles!perspectives_author_id_fkey(display_name)')
        .eq('memory_id', memoryId)
        .order('created_at', { ascending: true }),
    ]);
    setRevealed(Boolean(rv.data));
    setAll((ps.data as Perspective[]) ?? []);
  }, [memoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (revealed === null) return null;

  const mine = all.find((p) => p.author_id === me);
  const others = all.filter((p) => p.author_id !== me);

  async function skip() {
    const { error } = await supabase.from('reveal_states').insert({ memory_id: memoryId });
    setFailed(Boolean(error));
    await load();
  }

  async function removeMine() {
    if (!mine || !window.confirm(t.perspective.removeConfirm)) return;
    const { error } = await supabase.from('perspectives').delete().eq('id', mine.id);
    if (!error && mine.audio_path) await removeFiles([mine.audio_path]);
    setFailed(Boolean(error));
    await load();
  }

  const form = (
    <PerspectiveForm
      usId={usId}
      memoryId={memoryId}
      existing={mine}
      onDone={async (ok) => {
        setFailed(!ok);
        setEditing(false);
        await load();
      }}
    />
  );

  if (!revealed) {
    return (
      <section className="paper stack">
        <h2 className="subtitle">{t.perspective.prompt}</h2>
        {closed ? <p className="quiet small">{t.perspective.closedHint}</p> : <p className="quiet small">{t.perspective.hint}</p>}
        {!closed && form}
        <button className="link" onClick={skip}>
          {t.perspective.skip}
        </button>
        <ErrorNote show={failed} />
      </section>
    );
  }

  return (
    <section className="stack">
      {mine && !editing && (
        <div className="paper stack-sm">
          <div className="row between">
            <span className="quiet small">
              {t.perspective.mine}
              {mine.is_private && ` · ${t.perspective.privateTag}`}
            </span>
            {!closed && (
              <button className="link" onClick={() => setEditing(true)}>
                {t.perspective.edit}
              </button>
            )}
          </div>
          {mine.body && <p className="pre">{mine.body}</p>}
          {mine.audio_path && <AudioClip path={mine.audio_path} durationMs={mine.audio_duration_ms} />}
        </div>
      )}
      {(editing || (!mine && !closed)) && (
        <div className="paper stack-sm">
          <h2 className="subtitle">{mine ? t.perspective.edit : t.perspective.writeMine}</h2>
          {form}
          {mine && (
            <button className="link danger" onClick={removeMine}>
              {t.perspective.remove}
            </button>
          )}
        </div>
      )}

      <h2 className="subtitle">{t.perspective.others}</h2>
      {others.length === 0 ? (
        <p className="quiet small">{t.perspective.noneYet}</p>
      ) : (
        others.map((p) => (
          <div key={p.id} className="perspective stack-sm">
            <span className="quiet small">{p.profiles ? displayName(p.profiles.display_name) : t.perspective.someone}</span>
            {p.body && <p className="pre">{p.body}</p>}
            {p.audio_path && <AudioClip path={p.audio_path} durationMs={p.audio_duration_ms} />}
          </div>
        ))
      )}
      <ErrorNote show={failed} />
    </section>
  );
}

function PerspectiveForm({
  usId,
  memoryId,
  existing,
  onDone,
}: {
  usId: string;
  memoryId: string;
  existing?: Perspective;
  onDone: (ok: boolean) => void;
}) {
  const [body, setBody] = useState(existing?.body ?? '');
  const [isPrivate, setIsPrivate] = useState(existing?.is_private ?? false);
  const [voice, setVoice] = useState<PreparedMedia | null>(null);
  const [dropAudio, setDropAudio] = useState(false);
  const [busy, setBusy] = useState(false);

  const keepsAudio = Boolean(existing?.audio_path) && !dropAudio && !voice;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let audio: { audio_path: string | null; audio_mime: string | null; audio_duration_ms: number | null } | undefined;
      if (voice) {
        const path = await uploadPerspectiveAudio(usId, memoryId, voice);
        audio = { audio_path: path, audio_mime: voice.mime.split(';')[0], audio_duration_ms: voice.durationMs ?? null };
      } else if (dropAudio) {
        audio = { audio_path: null, audio_mime: null, audio_duration_ms: null };
      }
      const fields = { body: body.trim(), is_private: isPrivate, ...(audio ?? {}) };
      const { error } = existing
        ? await supabase.from('perspectives').update(fields).eq('id', existing.id)
        : await supabase.from('perspectives').insert({ memory_id: memoryId, ...fields });
      if (error) throw error;
      if (existing?.audio_path && audio) await removeFiles([existing.audio_path]);
      onDone(true);
    } catch {
      onDone(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack-sm">
      <textarea
        rows={4}
        maxLength={10000}
        value={body}
        placeholder={t.perspective.placeholder}
        onChange={(e) => setBody(e.target.value)}
      />
      {keepsAudio && existing?.audio_path && (
        <div className="row">
          <AudioClip path={existing.audio_path} durationMs={existing.audio_duration_ms} />
          <button type="button" className="link" onClick={() => setDropAudio(true)}>
            {t.memory.removeMedia}
          </button>
        </div>
      )}
      {voice ? (
        <div className="row">
          <span className="quiet small">
            {t.memory.voice} {voice.durationMs ? formatDuration(voice.durationMs) : ''}
          </span>
          <button type="button" className="link" onClick={() => setVoice(null)}>
            {t.memory.removeMedia}
          </button>
        </div>
      ) : (
        !keepsAudio && <VoiceRecorder onRecorded={setVoice} />
      )}
      <label className="radio">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        {t.perspective.private}
      </label>
      <button className="primary self-start" disabled={busy || (!body.trim() && !voice && !keepsAudio)}>
        {busy ? t.memory.saving : t.perspective.submit}
      </button>
    </form>
  );
}
