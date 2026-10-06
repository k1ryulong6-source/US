import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { BUCKET, SIGNED_URL_TTL } from './media';

/** Short-lived signed URLs for private media; never public links. */
export function useSignedUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');

  useEffect(() => {
    if (!paths.length) return setUrls({});
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        for (const item of data) if (item.path && item.signedUrl) next[item.path] = item.signedUrl;
        setUrls(next);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}
