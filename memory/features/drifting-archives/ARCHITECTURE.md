# Drifting Archives Architecture

- Frontend: React + Vite on Vercel, owner: personal team, status: active.
- Backend: Vercel Functions, status: active.
- Database route: Supabase Postgres Lite.
- Supabase project source: Vercel integration-create.
- Supabase resource name: `supabase-carmine-lighthouse`.
- Supabase project ref: `toakeuwxvwgcmuzxngrm`.
- Supabase organization/account: personal Vercel team `wnagzhimings-projects`.
- Binding confirmed by user: yes, 2026-09-06.
- Integration: SiliconFlow remains server-only for story generation.
- Data boundary: only anonymous public story content, choices, universe title and insight are stored. Age, occupation, personality and client identifiers are excluded.

## Delivery

- `POST /api/archives` publishes a completed archive to the sea.
- `GET /api/archives` retrieves one random published archive and increments its salvage count.
- “Launch into the galaxy” performs no server write and clears only the local run after confirmation.
