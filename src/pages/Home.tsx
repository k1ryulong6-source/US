import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usColors } from '../lib/palette';
import { usWash } from '../lib/washes';
import type { MyUsListItem } from '../lib/types';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import WeeklyQuestion from '../components/WeeklyQuestion';
import Wash from '../components/Wash';
import { PencilLoop } from '../components/Pencil';

interface MemberColor {
  us_id: string;
  user_id: string;
  joined_at: string;
  profiles: { color: string | null } | null;
}

/**
 * Every US is a wash of its people's pigments. The first in your order is the largest.
 * A quiet US has dried: paler, and it no longer moves.
 */
export default function Home() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [items, setItems] = useState<MyUsListItem[] | null>(null);
  const [colors, setColors] = useState<Map<string, string[]>>(new Map());
  const [reordering, setReordering] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('my_us_list')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    setFailed(Boolean(error));
    const list = (data as MyUsListItem[]) ?? [];
    setItems(list);
    if (!list.length) return;
    const { data: ms } = await supabase
      .from('us_members')
      .select('us_id, user_id, joined_at, profiles!us_members_user_id_fkey(color)')
      .in('us_id', list.map((u) => u.id))
      .is('left_at', null)
      .order('joined_at', { ascending: true });
    const byUs = new Map<string, MemberColor[]>();
    for (const m of (ms as unknown as MemberColor[]) ?? []) byUs.set(m.us_id, [...(byUs.get(m.us_id) ?? []), m]);
    const next = new Map<string, string[]>();
    for (const [usId, members] of byUs) {
      const resolved = usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me);
      next.set(usId, [resolved.get(me), ...members.filter((m) => m.user_id !== me).map((m) => resolved.get(m.user_id))].filter(Boolean) as string[]);
    }
    setColors(next);
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(index: number, delta: -1 | 1) {
    if (!items) return;
    const visible = items.filter((i) => !i.hidden);
    const target = index + delta;
    if (target < 0 || target >= visible.length) return;
    const next = [...visible];
    [next[index], next[target]] = [next[target], next[index]];
    const ordered = [...next, ...items.filter((i) => i.hidden)];
    setItems(ordered.map((i, n) => ({ ...i, sort_order: n + 1 })));
    const { error } = await supabase.rpc('reorder_my_us', { p_ids: ordered.map((i) => i.id) });
    if (error) {
      setFailed(true);
      void load();
    }
  }

  if (!items) return <p className="quiet center pad">{t.common.loading}</p>;

  const visible = items.filter((i) => !i.hidden);
  const hidden = items.filter((i) => i.hidden);

  return (
    <div className="home">
      {items.length === 0 && <p className="quiet pre center pad">{t.home.empty}</p>}

      <ul className="us-washes">
        {visible.map((us, index) => {
          const quiet = us.state !== 'active';
          return (
            <li key={us.id} className={index === 0 ? 'us-item first' : 'us-item'}>
              <Link to={`/us/${us.id}`} className="us-wash-link">
                <Wash
                  className="us-wash"
                  drops={usWash(colors.get(us.id) ?? [])}
                  flow={quiet ? 0 : index === 0 ? 0.045 : 0.06}
                  strength={quiet ? 0.5 : 1}
                  seed={index * 3.1 + 1.3}
                  scale={index === 0 ? 0.78 : 0.9}
                />
                <span className={quiet ? 'us-wash-name quiet' : 'us-wash-name'}>
                  {us.name}
                  {quiet && <span className="sr-only"> · {t.states[us.state]}</span>}
                </span>
              </Link>
              {reordering && (
                <span className="reorder">
                  <button aria-label={t.home.moveUp} onClick={() => move(index, -1)} disabled={index === 0}>
                    ↑
                  </button>
                  <button aria-label={t.home.moveDown} onClick={() => move(index, 1)} disabled={index === visible.length - 1}>
                    ↓
                  </button>
                </span>
              )}
            </li>
          );
        })}
        <li className={items.length ? 'us-item new' : 'us-item new first'}>
          <Link to="/new" className="pencil-link" aria-label={items.length ? t.home.create : undefined}>
            <PencilLoop width={60} height={60} seed="new-us" />
            {/* the first time, say what the empty pencil circle is for */}
            {items.length === 0 && <span className="small quiet">{t.home.create}</span>}
          </Link>
        </li>
      </ul>

      <WeeklyQuestion />

      {(visible.length > 1 || hidden.length > 0) && (
        <div className="home-tools">
          {visible.length > 1 && (
            <button className="link" onClick={() => setReordering((r) => !r)}>
              {reordering ? t.home.doneReorder : t.home.reorder}
            </button>
          )}
          {hidden.length > 0 && (
            <button className="link" onClick={() => setShowHidden((s) => !s)}>
              {t.home.hiddenSection(hidden.length)}
            </button>
          )}
        </div>
      )}
      {showHidden && (
        <ul className="plain">
          {hidden.map((us) => (
            <li key={us.id}>
              <Link to={`/us/${us.id}`} className="quiet">
                {us.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ErrorNote show={failed} />
    </div>
  );
}
