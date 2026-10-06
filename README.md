# US

A private PWA for a handful of people close to each other: a quiet space that
belongs to a relationship, not to any one user. Notice → Act (in real life) → Remember.

- Product decisions and data model: [docs/DESIGN.md](docs/DESIGN.md)
- Setup, deployment and phone testing: [docs/SETUP.md](docs/SETUP.md)

## Stack

React + TypeScript + Vite · Supabase (Auth with email OTP + anonymous sign-in,
Postgres with RLS, private Storage) · Cloudflare Pages · optional Cloudflare
Worker proxy for members in mainland China.

## Layout

```
src/strings/zh-CN.ts      all user-facing copy
src/pages/                screens
supabase/migrations/      schema, RLS, RPC functions
supabase/tests/           pgTAP tests proving who can read what
supabase/templates/       auth emails (6-digit code)
supabase/functions/       weekly-reminder Edge Function (optional Web Push)
supabase/sql/             one-off SQL to schedule the reminder
src/sw.ts                 service worker: app shell + push
deploy/supabase-proxy/    Cloudflare Worker reverse proxy
scripts/db/               run pgTAP without Docker
```

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # typecheck + production build
npx supabase test db   # 197 RLS / behaviour tests (needs `npx supabase start`)
npm run test:db:local  # same tests on a plain Postgres + pgTAP, no Docker
```
