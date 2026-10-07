import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { colorOf } from '../lib/palette';
import { t } from '../strings';
import MemoryForm from '../components/MemoryForm';
import Wash from '../components/Wash';
import { BackChevron } from '../components/Pencil';

/** A freshly wetted sheet: your drop lands and slowly spreads while you write. */
export default function MemoryNew() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const mine = colorOf(session?.user.id ?? '', profile?.color);
  return (
    <div className="memory-new">
      <div className="topbar">
        <Link to={`/us/${id}`} className="icon-link" aria-label={t.common.back}>
          <BackChevron />
        </Link>
      </div>
      <h1 className="sr-only">{t.memory.newTitle}</h1>
      <Wash
        className="wet-sheet"
        drops={[
          { x: 0, y: 0.02, r: 0.92, color: '#C9C2B4', alpha: 0.22 },
          { x: -0.05, y: -0.02, r: 0.52, color: mine, alpha: 0.9 },
        ]}
        grow={0.45}
        flow={0.06}
        seed={8.1}
      />
      <MemoryForm
        usId={id}
        onSaved={(mid, warning) => navigate(`/us/${id}/m/${mid}`, { replace: true, state: { warning } })}
      />
    </div>
  );
}
