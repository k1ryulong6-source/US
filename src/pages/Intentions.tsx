import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usColors } from '../lib/palette';
import { pool } from '../lib/washes';
import type { Intention } from '../lib/types';
import { t } from '../strings';
import IntentionItem from '../components/IntentionItem';
import Wash from '../components/Wash';
import { PencilLoop, PencilPlus } from '../components/Pencil';

interface MemberColor {
  us_id: string;
  user_id: string;
  profiles: { color: string | null } | null;
}

/** Things you carry: still in pencil until they are done, then painted in. */
export default function Intentions() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const location = useLocation();
  const saved = (location.state as { saved?: boolean } | null)?.saved;
  const [items, setItems] = useState<Intention[] | null>(null);
  const [usPaint, setUsPaint] = useState<Map<string, string[]>>(new Map());

  const load = useCallback(async () => {
    // Only US spaces I'm currently in (RLS), and only mine or shared ones.
    const { data } = await supabase
      .from('intentions')
      .select('*, us_spaces(name)')
      .order('created_at', { ascending: false });
    const list = ((data as Intention[]) ?? []).filter((i) => i.us_spaces);
    setItems(list);
    const usIds = [...new Set(list.filter((i) => i.status === 'done').map((i) => i.us_id))];
    if (!usIds.length) return;
    const { data: ms } = await supabase
      .from('us_members')
      .select('us_id, user_id, profiles!us_members_user_id_fkey(color)')
      .in('us_id', usIds)
      .is('left_at', null);
    const byUs = new Map<string, MemberColor[]>();
    for (const m of (ms as unknown as MemberColor[]) ?? []) byUs.set(m.us_id, [...(byUs.get(m.us_id) ?? []), m]);
    const next = new Map<string, string[]>();
    for (const [usId, members] of byUs) {
      const c = usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me);
      next.set(usId, [c.get(me), ...members.filter((m) => m.user_id !== me).map((m) => c.get(m.user_id))].filter(Boolean) as string[]);
    }
    setUsPaint(next);
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!items) return <p className="quiet center pad">{t.common.loading}</p>;

  const open = items.filter((i) => i.status === 'open');
  const done = items.filter((i) => i.status === 'done');
  const letGo = items.filter((i) => i.status === 'let_go' && i.author_id === me);

  return (
    <div className="intentions-page">
      <div className="topbar end">
        <Link to="/answer" className="icon-link" aria-label={t.intention.add}>
          <PencilPlus />
        </Link>
      </div>
      <h1 className="sr-only">{t.intention.title}</h1>
      {saved && <p className="quiet small">{t.intention.saved}</p>}

      <section className="intent-section">
        <p className="section-label">{t.intention.open}</p>
        {open.length === 0 ? (
          <p className="quiet">{t.intention.emptyOpen}</p>
        ) : (
          open.map((i) => (
            <div key={i.id} className="intent-row">
              <span className="intent-mark">
                <PencilLoop width={28} height={20} seed={i.id} />
              </span>
              <IntentionItem intention={i} me={me} showUs onChange={load} />
            </div>
          ))
        )}
      </section>

      {done.length > 0 && (
        <section className="intent-section">
          <p className="section-label">{t.intention.done}</p>
          {done.map((i, n) => (
            <div key={i.id} className="intent-row">
              <span className="intent-mark">
                <Wash className="intent-pool" drops={pool(usPaint.get(i.us_id) ?? [])} seed={n * 1.9 + 1.7} flow={0.04} />
              </span>
              <IntentionItem intention={i} me={me} showUs onChange={load} />
            </div>
          ))}
        </section>
      )}
      {letGo.length > 0 && (
        <details className="intent-section">
          <summary className="section-label">{t.intention.letGo}</summary>
          {letGo.map((i) => (
            <div key={i.id} className="intent-row">
              <span className="intent-mark" />
              <IntentionItem intention={i} me={me} showUs onChange={load} />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
