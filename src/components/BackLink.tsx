import { Link } from 'react-router-dom';
import { t } from '../strings';

export default function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="back">
      ← {t.common.back}
    </Link>
  );
}
