import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { loadMemory } from '../lib/memories';
import { useAuth } from '../lib/auth';
import type { Memory } from '../lib/types';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import MemoryForm from '../components/MemoryForm';

export default function MemoryEdit() {
  const { id = '', mid = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [memory, setMemory] = useState<Memory | null | undefined>(undefined);

  useEffect(() => {
    loadMemory(mid).then(setMemory);
  }, [mid]);

  if (memory === undefined) return <p className="quiet center pad">{t.common.loading}</p>;
  if (!memory || memory.author_id !== session?.user.id || memory.author_removed) {
    return <Navigate to={`/us/${id}`} replace />;
  }

  return (
    <div className="memory-edit">
      <BackLink to={`/us/${id}/m/${mid}`} />
      <header className="page-head">
        <h1 className="page-title">{t.memory.editTitle}</h1>
      </header>
      <MemoryForm
        usId={id}
        existing={memory}
        submitLabel={t.common.save}
        onSaved={(m, warning) => navigate(`/us/${id}/m/${m}`, { replace: true, state: { warning } })}
      />
    </div>
  );
}
