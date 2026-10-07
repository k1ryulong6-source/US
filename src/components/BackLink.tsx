import { Link } from 'react-router-dom';
import { t } from '../strings';
import { BackChevron } from './Pencil';

export default function BackLink({ to }: { to: string }) {
  return (
    <div className="topbar">
      <Link to={to} className="icon-link" aria-label={t.common.back}>
        <BackChevron />
      </Link>
    </div>
  );
}
