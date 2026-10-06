import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { displayName, formatDate } from '../lib/format';
import { t } from '../strings';
import BackLink from '../components/BackLink';

interface KeptRow {
  kept_at: string;
  seen_notes: {
    id: string;
    body: string;
    created_at: string;
    from: { display_name: string } | null;
    us_spaces: { name: string } | null;
  } | null;
}

/** The quiet collection of seen notes I chose to keep. Only I can see it. */
export default function SeenCollection() {
  const [rows, setRows] = useState<KeptRow[] | null>(null);

  useEffect(() => {
    supabase
      .from('seen_note_keeps')
      .select(
        'kept_at, seen_notes(id, body, created_at, from:profiles!seen_notes_from_id_fkey(display_name), us_spaces(name))',
      )
      .order('kept_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as KeptRow[]) ?? []));
  }, []);

  return (
    <div className="stack-lg">
      <BackLink to="/me" />
      <h1 className="title">{t.seen.collection}</h1>
      {rows === null ? null : rows.length === 0 ? (
        <p className="quiet">{t.seen.collectionEmpty}</p>
      ) : (
        rows.map(
          (r) =>
            r.seen_notes && (
              <div key={r.seen_notes.id} className="paper stack-sm note-card">
                <p className="pre">{r.seen_notes.body}</p>
                <span className="quiet small">
                  {[
                    r.seen_notes.from ? displayName(r.seen_notes.from.display_name) : t.perspective.someone,
                    r.seen_notes.us_spaces ? t.seen.inUs(r.seen_notes.us_spaces.name) : '',
                    formatDate(r.seen_notes.created_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            ),
        )
      )}
    </div>
  );
}
