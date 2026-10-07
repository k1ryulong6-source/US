import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usColors } from '../lib/palette';
import { usWash } from '../lib/washes';
import { displayName } from '../lib/format';
import type { MyUsListItem } from '../lib/types';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import WeeklyQuestion from '../components/WeeklyQuestion';
import Wash from '../components/Wash';
import { PencilLoop } from '../components/Pencil';
import { rememberSplashColors } from '../components/Splash';

interface MemberColor {
  us_id: string;
  user_id: string;
  joined_at: string;
  profiles: { color: string | null; display_name: string | null } | null;
}

const WEEKDAYS = '日一二三四五六';
function todayLine() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${WEEKDAYS[d.getDay()]}`;
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
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [reordering, setReordering] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [failed, setFailed] = useState(false);
  // US where others added something since my last visit: their paint is still moving (only I see it)
  const [news, setNews] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    // proposals nobody declined for 14 days take effect when someone next comes by
    await supabase.rpc('settle_proposals', {});
    const { data, error } = await supabase
      .from('my_us_list')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    setFailed(Boolean(error));
    const list = (data as MyUsListItem[]) ?? [];
    setItems(list);
    if (!list.length) return;
    const { data: news } = await supabase.rpc('us_with_news');
    setNews(new Set((news as string[] | null) ?? []));
    const { data: ms } = await supabase
      .from('us_members')
      .select('us_id, user_id, joined_at, profiles!us_members_user_id_fkey(color, display_name)')
      .in('us_id', list.map((u) => u.id))
      .is('left_at', null)
      .order('joined_at', { ascending: true });
    const byUs = new Map<string, MemberColor[]>();
    for (const m of (ms as unknown as MemberColor[]) ?? []) byUs.set(m.us_id, [...(byUs.get(m.us_id) ?? []), m]);
    const next = new Map<string, string[]>();
    const who = new Map<string, string>();
    for (const [usId, members] of byUs) {
      const others = members.filter((m) => m.user_id !== me).map((m) => displayName(m.profiles?.display_name));
      who.set(usId, [t.common.you, ...others].join('、'));
      const resolved = usColors(members.map((m) => ({ user_id: m.user_id, color: m.profiles?.color })), me);
      next.set(usId, [resolved.get(me), ...members.filter((m) => m.user_id !== me).map((m) => resolved.get(m.user_id))].filter(Boolean) as string[]);
    }
    setColors(next);
    setPeople(who);
    // the next launch opens with the colours of your first US
    const first = list.find((u) => !u.hidden);
    if (first && next.get(first.id)?.length) rememberSplashColors(next.get(first.id)!);
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
      <header className="tab-head">
        <p className="tab-date">{todayLine()}</p>
        <WeeklyQuestion />
      </header>
      {items.length === 0 && <p className="home-empty pre">{t.home.empty}</p>}

      <ul className="us-washes">
        {visible.map((us, index) => {
          const quiet = us.state !== 'active';
          return (
            <li key={us.id} className={index === 0 ? 'us-item first' : 'us-item'}>
              <Link to={`/us/${us.id}`} className="us-wash-link">
                <Wash
                  className="us-wash"
                  drops={usWash(colors.get(us.id) ?? [])}
                  flow={quiet ? 0 : news.has(us.id) ? 0.12 : index === 0 ? 0.045 : 0.06}
                  strength={quiet ? 0.5 : 1}
                  seed={index * 3.1 + 1.3}
                  scale={index === 0 ? 0.78 : 0.9}
                />
                <span className={quiet ? 'us-wash-name quiet' : 'us-wash-name'}>
                  <span>{us.name}</span>
                  {people.get(us.id) && <span className="us-wash-people">{people.get(us.id)}</span>}
                  {quiet && <span className="sr-only"> · {t.states[us.state]}</span>}
                  {news.has(us.id) && <span className="sr-only"> · {t.home.fresh}</span>}
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
          <Link to="/new" className="pencil-link">
            <PencilLoop width={60} height={60} seed="new-us" />
            <span className="us-new-label">{t.home.create}</span>
          </Link>
        </li>
      </ul>


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
