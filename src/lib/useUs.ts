import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Member, UsSpace } from './types';

export function useUs(id: string | undefined) {
  const [space, setSpace] = useState<UsSpace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [missing, setMissing] = useState(false);
  const settled = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    // proposals nobody declined for 14 days take effect when someone next comes by
    if (settled.current !== id) {
      settled.current = id;
      await supabase.rpc('settle_proposals', { p_us: id });
    }
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase
        .from('us_spaces')
        .select('id, name, description, preset_label, stage, state, cover_path')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('us_members')
        .select('user_id, joined_at, left_at, profiles!us_members_user_id_fkey(display_name, color, avatar_path)')
        .eq('us_id', id)
        .is('left_at', null)
        .order('joined_at', { ascending: true }),
    ]);
    // RLS returns nothing when you're not a member: treat it the same as "not found".
    setMissing(!s);
    setSpace((s as UsSpace) ?? null);
    setMembers((m as unknown as Member[]) ?? []);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { space, members, missing, reload };
}
