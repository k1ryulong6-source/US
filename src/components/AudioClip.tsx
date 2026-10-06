import { useSignedUrls } from '../lib/useSignedUrls';
import { formatDuration } from '../lib/format';

export default function AudioClip({ path, durationMs }: { path: string; durationMs?: number | null }) {
  const urls = useSignedUrls([path]);
  return (
    <div className="audio">
      {urls[path] && <audio controls preload="none" src={urls[path]} />}
      {durationMs ? <span className="quiet small">{formatDuration(durationMs)}</span> : null}
    </div>
  );
}
