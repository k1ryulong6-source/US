import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../strings';
import { BackChevron } from './Pencil';

/** The way back, and optionally something quiet on the right. */
export default function BackLink({ to, children }: { to: string; children?: ReactNode }) {
  return (
    <div className="topbar">
      <Link to={to} className="icon-link" aria-label={t.common.back}>
        <BackChevron />
      </Link>
      {children}
    </div>
  );
}
