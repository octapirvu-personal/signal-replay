-- Signal Replay — Supabase schema (cloud-only persistence, per-user via RLS).
--
-- Run this in your Supabase project: Dashboard → SQL Editor → paste → Run.
-- Safe to re-run: it drops and recreates the app tables (they hold only your
-- own data; on a fresh project there's nothing to lose).
--
-- This mirrors the app's existing local (IndexedDB) layout 1:1 so the client
-- code is a drop-in swap:
--   datasets   — one row per loaded CSV: metadata + the parsed bars (jsonb)
--   decisions  — one row per signal: take/skip + note + rating
--   kv         — generic key/value store backing settings, the per-dataset
--                drawing snapshots ("drawings:<id>") and replay positions
--                ("pos:<id>"), and the "lastDataset" pointer
--
-- Every row is owned by a user and locked down with Row-Level Security: a
-- signed-in user can only see and modify their own rows.

-- Drop superseded objects from earlier setup attempts (no-op if absent).
drop table if exists public.datasets  cascade;
drop table if exists public.decisions cascade;
drop table if exists public.drawings  cascade;
drop table if exists public.positions cascade;
drop table if exists public.settings  cascade;
drop table if exists public.kv        cascade;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.datasets (
  user_id          uuid        not null references auth.users (id) on delete cascade,
  id               text        not null,             -- app-side id: name|count|first|last
  name             text        not null,
  bars             jsonb       not null,             -- parsed OHLC bars
  csv_flags        jsonb,                            -- per-bar signal flags from the CSV (nullable)
  has_csv_signals  boolean     not null default false,
  created_at       timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.decisions (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  dataset_id   text        not null,
  signal_time  bigint      not null,
  decision     text        not null check (decision in ('take', 'skip')),
  note         text,
  rating       text,
  updated_at   timestamptz not null default now(),
  primary key (user_id, dataset_id, signal_time)
);

create table public.kv (
  user_id  uuid  not null references auth.users (id) on delete cascade,
  key      text  not null,
  value    jsonb,
  primary key (user_id, key)
);

-- ---------------------------------------------------------------------------
-- Row-Level Security: each row is private to its owner (auth.uid()).
-- ---------------------------------------------------------------------------

alter table public.datasets  enable row level security;
alter table public.decisions enable row level security;
alter table public.kv        enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['datasets', 'decisions', 'kv']
  loop
    execute format('drop policy if exists "owner_rw" on public.%I', t);
    execute format(
      'create policy "owner_rw" on public.%I
         for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);
  end loop;
end $$;
