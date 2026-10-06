import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { t } from '../strings';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <main className="page">{children}</main>
      <nav className="tabbar" aria-label="main">
        <NavLink to="/" end>{t.nav.home}</NavLink>
        <NavLink to="/intentions">{t.nav.intentions}</NavLink>
        <NavLink to="/me">{t.nav.me}</NavLink>
      </nav>
    </div>
  );
}
