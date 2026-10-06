// Reverse proxy: lets members in mainland China reach Supabase through your
// own domain (e.g. https://api.example.com), since *.supabase.co is not
// reliably reachable there. Forwards only Supabase API paths; everything
// else gets a 404. Works for REST, Auth, Storage (incl. signed URLs) and
// Realtime websockets.
const ALLOWED_PREFIXES = ['/auth/v1/', '/rest/v1/', '/storage/v1/', '/realtime/v1/', '/functions/v1/'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!ALLOWED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      return new Response('Not found', { status: 404 });
    }
    const upstream = new URL(url.pathname + url.search, env.SUPABASE_URL);
    return fetch(new Request(upstream, request));
  },
};
