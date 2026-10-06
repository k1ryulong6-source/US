import { useNavigate, useParams } from 'react-router-dom';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import MemoryForm from '../components/MemoryForm';

export default function MemoryNew() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  return (
    <div className="stack-lg">
      <BackLink to={`/us/${id}`} />
      <h1 className="title">{t.memory.newTitle}</h1>
      <MemoryForm
        usId={id}
        onSaved={(mid, warning) => navigate(`/us/${id}/m/${mid}`, { replace: true, state: { warning } })}
      />
    </div>
  );
}
