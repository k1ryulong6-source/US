import { useState } from 'react';
import { buildExport } from '../lib/exportData';
import { todayIso } from '../lib/format';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import ErrorNote from '../components/ErrorNote';

export default function Export() {
  const [state, setState] = useState<'idle' | 'working' | 'ready'>('idle');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setState('working');
    setFailed(false);
    setProgress(null);
    try {
      const blob = await buildExport((d, n) => setProgress([d, n]));
      const name = `us-export-${todayIso()}.zip`;
      const file = new File([blob], name, { type: 'application/zip' });
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      // Installed iOS apps can't follow blob downloads; the share sheet can save the file.
      if (standalone && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setState('ready');
    } catch {
      setFailed(true);
      setState('idle');
    }
  }

  return (
    <div className="export-page">
      <BackLink to="/me" />
      <header className="page-head">
        <h1 className="page-title">{t.export.title}</h1>
      </header>
      <p className="quiet">{t.export.intro}</p>
      {state === 'working' ? (
        <p className="quiet">{progress ? t.export.working(progress[0], progress[1]) : t.export.collecting}</p>
      ) : (
        <button className="primary center-self" onClick={run}>
          {state === 'ready' ? t.export.again : t.export.start}
        </button>
      )}
      {state === 'ready' && <p className="note center">{t.export.ready}</p>}
      <ErrorNote show={failed} />
    </div>
  );
}
