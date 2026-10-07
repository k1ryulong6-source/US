import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { t } from '../strings';

export default function Layout({ children }: { children: ReactNode }) {
  // A new page settles onto the paper: its paint comes up from under a sheet of paper while the
  // words soak in, like ink. The three words at the bottom stay where they are.
  const { pathname } = useLocation();
  return (
    <div className="shell">
      <span key={`veil-${pathname}`} className="paint-veil" aria-hidden="true" />
      <main key={pathname} className="page page-enter">
        {children}
      </main>
      <nav className="tabbar" aria-label="main">
        <NavLink to="/" end>{t.nav.home}</NavLink>
        <NavLink to="/intentions">{t.nav.intentions}</NavLink>
        <NavLink to="/me">{t.nav.me}</NavLink>
      </nav>
    </div>
  );
}
