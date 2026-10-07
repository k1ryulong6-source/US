import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { loadMemory } from '../lib/memories';
import { removeFiles } from '../lib/media';
import { useAuth } from '../lib/auth';
import { useUs } from '../lib/useUs';
import { useSignedUrls } from '../lib/useSignedUrls';
import { usColors } from '../lib/palette';
import { pool } from '../lib/washes';
import { displayName, formatMemoryDate } from '../lib/format';
import type { Memory } from '../lib/types';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import MediaView from '../components/MediaView';
import Perspectives from '../components/Perspectives';
import Wash from '../components/Wash';
import { BackChevron, PencilRule } from '../components/Pencil';

/**
 * One memory. Its photo is soaked into the wash of the people who remember it:
 * whoever wrote it, and everyone whose version you can see. Below, one reading column.
 */
export default function MemoryDetail() {
  const { id = '', mid = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const warning = (location.state as { warning?: string } | null)?.warning;
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { space, members } = useUs(id);
  const [memory, setMemory] = useState<Memory | null | undefined>(undefined);
  const [voices, setVoices] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadMemory(mid).then(setMemory);
  }, [mid]);

  const images = useMemo(
    () => [...(memory?.memory_media ?? [])].sort((a, b) => a.position - b.position).filter((m) => m.kind === 'image'),
    [memory],
  );
  const urls = useSignedUrls(images.slice(0, 1).map((m) => m.storage_path));
  const colors = useMemo(
    () => usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me),
    [members, me],
  );

  if (memory === undefined) return <p className="quiet center pad">{t.common.loading}</p>;
  if (memory === null) return <Navigate to={`/us/${id}`} replace />;

  const colorOf = (uid: string | null) => (uid && colors.get(uid)) || '#9C9488';
  const mine = memory.author_id === me;
  const editable = mine && !memory.author_removed && space?.state !== 'closed';
  const hero = images[0] ? urls[images[0].storage_path] : null;
  const rest = (memory.memory_media ?? []).filter((m) => images.length > 1 || m.kind !== 'image');
  const washColors = [colorOf(memory.author_id), ...voices.map(colorOf)];
  const author = memory.author_id
    ? mine
      ? t.memory.byMe
      : t.memory.by(displayName(memory.profiles?.display_name))
    : '';

  async function remove() {
    if (!window.confirm(t.memory.deleteConfirm)) return;
    const { data, error } = await supabase.rpc('delete_memory', { p_memory: mid });
    if (error) return setFailed(true);
    await removeFiles((data as string[]) ?? []);
    navigate(`/us/${id}`, { replace: true });
  }

  return (
    <article className="memory-page">
      <div className="topbar">
        <Link to={`/us/${id}`} className="icon-link" aria-label={t.common.back}>
          <BackChevron />
        </Link>
        {editable && (
          <Link to={`/us/${id}/m/${mid}/edit`} className="topbar-links">
            {t.memory.edit}
          </Link>
        )}
      </div>

      <button type="button" className="memory-hero" onClick={() => hero && setOpen(true)} disabled={!hero} aria-label={t.memory.photos}>
        <Wash className="memory-wash" drops={pool(washColors)} photo={hero} seed={2.2} flow={0.04} />
      </button>

      <div className="column">
        <header className="memory-head">
          <h1 className="memory-date">{formatMemoryDate(memory.happened_on, memory.happened_precision)}</h1>
          <p className="memory-meta">
            {memory.place && <span>{memory.place}</span>}
            {memory.place && author && <span aria-hidden="true">·</span>}
            {author && (
              <span className="person">
                <span className="dot" style={{ background: colorOf(memory.author_id) }} />
                {author}
              </span>
            )}
          </p>
        </header>

        {warning && <p className="quiet small">{warning}</p>}

        {memory.author_removed ? (
          <p className="quiet">{t.memory.removedShell}</p>
        ) : (
          <>
            {memory.body && <p className="pre memory-body">{memory.body}</p>}
            {rest.length > 0 && <MediaView media={rest} />}
          </>
        )}

        <PencilRule />

        {session && (
          <Perspectives
            usId={id}
            memoryId={mid}
            me={me}
            closed={space?.state === 'closed'}
            colorOf={colorOf}
            onAuthors={(ids) => setVoices(ids.filter((a) => a !== memory.author_id))}
          />
        )}

        {editable && (
          <button className="link danger" onClick={remove}>
            {t.memory.delete}
          </button>
        )}
        <ErrorNote show={failed} />
      </div>

      {open && hero && (
        <div className="lightbox" role="dialog" onClick={() => setOpen(false)}>
          <img src={hero} alt="" />
        </div>
      )}
    </article>
  );
}
