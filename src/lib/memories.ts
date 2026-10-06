import { supabase } from './supabase';
import type { Memory } from './types';

export const MEMORY_SELECT = '*, profiles!memories_author_id_fkey(display_name), memory_media(*)';

export async function loadMemory(id: string): Promise<Memory | null> {
  const { data } = await supabase.from('memories').select(MEMORY_SELECT).eq('id', id).maybeSingle();
  return (data as Memory) ?? null;
}
