create extension if not exists pgcrypto;

create table if not exists public.drifting_archives (
  id uuid primary key default gen_random_uuid(),
  archive_code text not null unique,
  assumption text not null check (char_length(assumption) between 2 and 50),
  universe_title text not null check (char_length(universe_title) <= 30),
  scenes jsonb not null,
  path jsonb not null,
  insight text not null check (char_length(insight) <= 500),
  salvage_count integer not null default 0,
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

create index if not exists drifting_archives_status_created_idx
  on public.drifting_archives (status, created_at desc);

alter table public.drifting_archives enable row level security;

-- Public access goes through validated server functions only.
revoke all on public.drifting_archives from anon, authenticated;
