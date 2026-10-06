import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { presetName } from '../lib/format';
import type { MyUsListItem } from '../lib/types';
import { t } from '../strings';
import ErrorNote from '../components/ErrorNote';
import WeeklyQuestion from '../components/WeeklyQuestion';

export default function Home() {
  const [items, setItems] = useState<MyUsListItem[] | null>(null);
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
    setItems((data as MyUsListItem[]) ?? []);
  }, []);

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
    <div className="stack-lg">
      <WeeklyQuestion />

      {items.length === 0 ? (
        <p className="quiet pre center pad">{t.home.empty}</p>
      ) : visible.length === 0 ? null : (
        <ul className="us-list">
          {visible.map((us, index) => (
            <li key={us.id} className="us-card">
              <Link to={`/us/${us.id}`} className="us-card-link">
                <span className="us-name">{us.name}</span>
                <span className="us-meta">
                  {[presetName(us.preset_label), us.stage, t.states[us.state]]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
              {reordering && (
                <span className="reorder">
                  <button aria-label={t.home.moveUp} onClick={() => move(index, -1)} disabled={index === 0}>
                    ↑
                  </button>
                  <button
                    aria-label={t.home.moveDown}
                    onClick={() => move(index, 1)}
                    disabled={index === visible.length - 1}
                  >
                    ↓
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        <Link to="/new" className="button primary">
          {t.home.create}
        </Link>
        {visible.length > 1 && (
          <button className="link" onClick={() => setReordering((r) => !r)}>
            {reordering ? t.home.doneReorder : t.home.reorder}
          </button>
        )}
      </div>

      {hidden.length > 0 && (
        <section>
          <button className="link" onClick={() => setShowHidden((s) => !s)}>
            {t.home.hiddenSection(hidden.length)}
          </button>
          {showHidden && (
            <ul className="us-list muted">
              {hidden.map((us) => (
                <li key={us.id} className="us-card">
                  <Link to={`/us/${us.id}`} className="us-card-link">
                    <span className="us-name">{us.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ErrorNote show={failed} />
    </div>
  );
}
