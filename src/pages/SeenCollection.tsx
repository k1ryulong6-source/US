import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { displayName, formatDate } from '../lib/format';
import { t } from '../strings';
import BackLink from '../components/BackLink';
import { colorOf } from '../lib/palette';
import Wash from '../components/Wash';

interface KeptRow {
  kept_at: string;
  seen_notes: {
    id: string;
    body: string;
    created_at: string;
    from_id: string;
    from: { display_name: string; color: string | null } | null;
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
        'kept_at, seen_notes(id, body, created_at, from_id, from:profiles!seen_notes_from_id_fkey(display_name, color), us_spaces(name))',
      )
      .order('kept_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as KeptRow[]) ?? []));
  }, []);

  return (
    <div className="seen-page">
      <BackLink to="/me" />
      <header className="page-head">
        <h1 className="page-title">{t.seen.collection}</h1>
      </header>
      {rows === null ? null : rows.length === 0 ? (
        <p className="quiet">{t.seen.collectionEmpty}</p>
      ) : (
        rows.map(
          (r, i) =>
            r.seen_notes && (
              <div key={r.seen_notes.id} className="seen-note">
                {/* a fleck of the writer's colour */}
                <Wash
                  className="fleck note-fleck"
                  drops={[
                    { x: 0, y: 0, r: 0.78, color: colorOf(r.seen_notes.from_id, r.seen_notes.from?.color), alpha: 0.9, aspect: 1.15, angle: -0.5 },
                    { x: 0.95, y: 0.75, r: 0.2, color: colorOf(r.seen_notes.from_id, r.seen_notes.from?.color), alpha: 0.85 },
                  ]}
                  seed={i * 1.3 + 1.1}
                />
                <div className="seen-note-text">
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
              </div>
            ),
        )
      )}
    </div>
  );
}
