import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { loadMemory } from '../lib/memories';
import { removeFiles } from '../lib/media';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { displayName, formatMemoryDate } from '../lib/format';
import type { Memory } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import ErrorNote from '../components/ErrorNote';
import MediaView from '../components/MediaView';
import Perspectives from '../components/Perspectives';

export default function MemoryDetail() {
  const { id = '', mid = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const warning = (location.state as { warning?: string } | null)?.warning;
  const { session } = useAuth();
  const { space } = useUs(id);
  const [memory, setMemory] = useState<Memory | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadMemory(mid).then(setMemory);
  }, [mid]);

  if (memory === undefined) return <p className="quiet center pad">{t.common.loading}</p>;
  if (memory === null) return <Navigate to={`/us/${id}`} replace />;

  const mine = memory.author_id === session?.user.id;
  const editable = mine && !memory.author_removed && space?.state !== 'closed';

  async function remove() {
    if (!window.confirm(t.memory.deleteConfirm)) return;
    const { data, error } = await supabase.rpc('delete_memory', { p_memory: mid });
    if (error) return setFailed(true);
    await removeFiles((data as string[]) ?? []);
    navigate(`/us/${id}`, { replace: true });
  }

  return (
    <div className="stack-lg">
      <div className="row between">
        <BackLink to={`/us/${id}`} />
        {editable && (
          <Link to={`/us/${id}/m/${mid}/edit`} className="link">
            {t.memory.edit}
          </Link>
        )}
      </div>

      <header className="stack-sm">
        <p className="quiet">
          {[formatMemoryDate(memory.happened_on, memory.happened_precision), memory.place].filter(Boolean).join(' · ')}
        </p>
        <p className="quiet small">
          {mine ? t.memory.byMe : t.memory.by(displayName(memory.profiles?.display_name))}
        </p>
      </header>

      {warning && <p className="note">{warning}</p>}

      {memory.author_removed ? (
        <p className="quiet">{t.memory.removedShell}</p>
      ) : (
        <>
          {memory.body && <p className="pre memory-body">{memory.body}</p>}
          <MediaView media={memory.memory_media ?? []} />
        </>
      )}

      {session && (
        <Perspectives usId={id} memoryId={mid} me={session.user.id} closed={space?.state === 'closed'} />
      )}

      {editable && (
        <button className="link danger" onClick={remove}>
          {t.memory.delete}
        </button>
      )}
      <ErrorNote show={failed} />
    </div>
  );
}
