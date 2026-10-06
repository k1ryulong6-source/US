import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Intention } from '../lib/types';
import { t } from '../strings';
import IntentionItem from '../components/IntentionItem';

export default function Intentions() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const location = useLocation();
  const saved = (location.state as { saved?: boolean } | null)?.saved;
  const [items, setItems] = useState<Intention[] | null>(null);

  const load = useCallback(async () => {
    // Only US spaces I'm currently in (RLS), and only mine or shared ones.
    const { data } = await supabase
      .from('intentions')
      .select('*, us_spaces(name)')
      .order('created_at', { ascending: false });
    setItems(((data as Intention[]) ?? []).filter((i) => i.us_spaces));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!items) return <p className="quiet center pad">{t.common.loading}</p>;

  const open = items.filter((i) => i.status === 'open');
  const done = items.filter((i) => i.status === 'done');
  const letGo = items.filter((i) => i.status === 'let_go' && i.author_id === me);

  return (
    <div className="stack-lg">
      <h1 className="title">{t.intention.title}</h1>
      {saved && <p className="note">{t.intention.saved}</p>}

      <section className="stack">
        {open.length === 0 ? (
          <p className="quiet">{t.intention.emptyOpen}</p>
        ) : (
          open.map((i) => <IntentionItem key={i.id} intention={i} me={me} showUs onChange={load} />)
        )}
        <Link to="/answer" className="button secondary self-start">
          {t.intention.add}
        </Link>
      </section>

      {done.length > 0 && (
        <details>
          <summary className="link">{t.intention.done}</summary>
          <div className="stack pad-top-sm">
            {done.map((i) => (
              <IntentionItem key={i.id} intention={i} me={me} showUs onChange={load} />
            ))}
          </div>
        </details>
      )}
      {letGo.length > 0 && (
        <details>
          <summary className="link">{t.intention.letGo}</summary>
          <div className="stack pad-top-sm">
            {letGo.map((i) => (
              <IntentionItem key={i.id} intention={i} me={me} showUs onChange={load} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
