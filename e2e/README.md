# End-to-end flows

Playwright scripts that drive the app on a phone-sized browser against the **local** stack.
Each flow signs people in through the local mail catcher, so nothing here touches a real project.

```bash
# from the repo root, once
npx supabase start            # local Postgres, Auth, Storage, Mailpit (needs Docker)
npm run dev                   # http://127.0.0.1:5173 with .env.local pointing at the local API

# here
cd e2e && npm install
npx playwright install chromium   # or set CHROMIUM_PATH to an installed Chromium
npm test                      # every flow, fresh database each time
GL=1 npm test                 # also the WebGL watercolour pass (slow on software GL)
node memories.mjs             # one flow; screenshots land in e2e/shots/
```

`npm test` **empties the local database** before each flow (`delete from auth.users …` on port 54322).

| Script | Covers |
| --- | --- |
| `flow.mjs` | email code sign-in, name, create a US, invite link, guest join, proposals, hiding a US |
| `memories.mjs` | memory with photo and voice, month-only date, edit, delete, storage cleanup |
| `perspectives.mjs` | several people writing on one memory, private notes, seen notes |
| `intentions.mjs` | weekly question, private and shared intentions, done → memory |
| `phase_e.mjs` | timeline, export ZIP, leaving a US with your content |
| `export_photos.mjs` | avatar and relationship photo reach the export ZIP |
| `noemail.mjs` | start without email (anonymous sign-in) |
| `design.mjs` | colours, avatar, cover, soaked photos with WebGL on (`GL=1`) |

Environment: `E2E_BASE` (app URL), `E2E_SHOTS` (screenshot folder), `CHROMIUM_PATH`, `GL=1`.
