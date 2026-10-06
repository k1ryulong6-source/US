import { Link } from 'react-router-dom';
import { formatMemoryDate } from '../lib/format';
import { useSignedUrls } from '../lib/useSignedUrls';
import type { Memory } from '../lib/types';
import { t } from '../strings';

export default function MemoryCard({ memory }: { memory: Memory }) {
  const media = [...(memory.memory_media ?? [])].sort((a, b) => a.position - b.position);
  const cover = media.find((m) => m.kind === 'image');
  const urls = useSignedUrls(cover ? [cover.storage_path] : []);
  const photos = media.filter((m) => m.kind === 'image').length;
  const hasVoice = media.some((m) => m.kind === 'audio');

  return (
    <Link to={`/us/${memory.us_id}/m/${memory.id}`} className="memory-card">
      {cover && urls[cover.storage_path] && <img className="cover" src={urls[cover.storage_path]} alt="" loading="lazy" />}
      <div className="memory-card-text">
        <span className="quiet small">
          {[formatMemoryDate(memory.happened_on, memory.happened_precision), memory.place].filter(Boolean).join(' · ')}
        </span>
        {memory.author_removed ? (
          <p className="quiet small">{t.memory.removedShell}</p>
        ) : (
          memory.body && <p className="clamp">{memory.body}</p>
        )}
        {(photos > 1 || hasVoice) && (
          <span className="quiet small">
            {[photos > 1 ? t.memory.photoCount(photos) : '', hasVoice ? t.memory.hasVoice : ''].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </Link>
  );
}
