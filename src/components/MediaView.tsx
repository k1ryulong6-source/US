import { useState } from 'react';
import { useSignedUrls } from '../lib/useSignedUrls';
import { formatDuration } from '../lib/format';
import type { MemoryMedia } from '../lib/types';

export default function MediaView({ media }: { media: MemoryMedia[] }) {
  const sorted = [...media].sort((a, b) => a.position - b.position);
  const urls = useSignedUrls(sorted.map((m) => m.storage_path));
  const [open, setOpen] = useState<string | null>(null);
  const images = sorted.filter((m) => m.kind === 'image');
  const audio = sorted.filter((m) => m.kind === 'audio');

  return (
    <div className="stack-sm">
      {images.length > 0 && (
        <div className={images.length === 1 ? 'photos single' : 'photos'}>
          {images.map((m) =>
            urls[m.storage_path] ? (
              <button key={m.id} type="button" className="photo" onClick={() => setOpen(m.storage_path)}>
                <img src={urls[m.storage_path]} alt="" loading="lazy" />
              </button>
            ) : (
              <span key={m.id} className="photo placeholder" />
            ),
          )}
        </div>
      )}
      {audio.map((m) => (
        <div key={m.id} className="audio">
          {urls[m.storage_path] && <audio controls preload="none" src={urls[m.storage_path]} />}
          {m.duration_ms ? <span className="quiet small">{formatDuration(m.duration_ms)}</span> : null}
        </div>
      ))}
      {open && urls[open] && (
        <div className="lightbox" role="dialog" onClick={() => setOpen(null)}>
          <img src={urls[open]} alt="" />
        </div>
      )}
    </div>
  );
}
