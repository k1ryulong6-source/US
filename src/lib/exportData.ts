import { strToU8, zipSync, type Zippable } from 'fflate';
import { supabase } from './supabase';
import { BUCKET } from './media';
import { t } from '../strings';

// Everything RLS lets me read: what I wrote (even in US spaces I left) plus
// the shared content of the US spaces I'm in.
const TABLES = [
  'profiles',
  'us_spaces',
  'us_members',
  'my_us_prefs',
  'relationship_history',
  'memories',
  'memory_media',
  'perspectives',
  'intentions',
  'seen_notes',
  'seen_note_keeps',
] as const;

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) throw error;
    rows.push(...((data as Record<string, unknown>[]) ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function buildExport(onProgress: (done: number, total: number) => void): Promise<Blob> {
  const data: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const table of TABLES) data[table] = await fetchAll(table);

  const paths = [
    ...(data.memory_media as { storage_path: string }[]).map((m) => m.storage_path),
    ...(data.perspectives as { audio_path: string | null }[]).map((p) => p.audio_path).filter(Boolean),
  ] as string[];

  const files: Zippable = {
    'README.txt': strToU8(t.export.readme),
    'data.json': strToU8(JSON.stringify(data, null, 2)),
  };

  let done = 0;
  onProgress(done, paths.length);
  for (let i = 0; i < paths.length; i += 50) {
    const batch = paths.slice(i, i + 50);
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(batch, 600);
    for (const item of signed ?? []) {
      if (item.signedUrl && item.path) {
        const res = await fetch(item.signedUrl);
        if (res.ok) files[`media/${item.path}`] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
      }
      onProgress(++done, paths.length);
    }
  }

  const zipped = zipSync(files);
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}
