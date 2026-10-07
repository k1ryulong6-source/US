import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.');
}

// Named explicitly: moving to another device (lib/transfer.ts) forgets the session by this key.
export const AUTH_STORAGE_KEY = 'us-auth';

export const supabase = createClient(url, anonKey, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // We sign in with a 6-digit code, never via redirect links.
    detectSessionInUrl: false,
  },
});
