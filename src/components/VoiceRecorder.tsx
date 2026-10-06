import { useEffect, useRef, useState } from 'react';
import { pickAudioMime, type PreparedMedia } from '../lib/media';
import { formatDuration } from '../lib/format';
import { t } from '../strings';

const MAX_MS = 5 * 60 * 1000;

export default function VoiceRecorder({ onRecorded }: { onRecorded: (m: PreparedMedia) => void }) {
  const [state, setState] = useState<'idle' | 'recording'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  const mime = pickAudioMime();
  if (mime === null) return <p className="quiet small">{t.recorder.unsupported}</p>;

  async function start() {
    setProblem(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem(t.recorder.denied);
      return;
    }
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) window.clearInterval(timer.current);
      const type = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      setState('idle');
      setElapsed(0);
      if (blob.size) {
        onRecorded({
          kind: 'audio',
          blob,
          mime: type,
          durationMs: Date.now() - startedAt,
          previewUrl: URL.createObjectURL(blob),
        });
      }
    };
    recorder.current = rec;
    rec.start(1000);
    setState('recording');
    timer.current = window.setInterval(() => {
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      if (ms >= MAX_MS) rec.stop();
    }, 250);
  }

  return (
    <div className="stack-sm">
      {state === 'idle' ? (
        <button type="button" className="secondary" onClick={start}>
          {t.recorder.start}
        </button>
      ) : (
        <button type="button" className="secondary recording" onClick={() => recorder.current?.stop()}>
          {t.recorder.recording(formatDuration(elapsed))} · {t.recorder.stop}
        </button>
      )}
      {problem && <p className="quiet small">{problem}</p>}
    </div>
  );
}
