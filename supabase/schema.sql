-- Run this once in the Supabase SQL editor for the gg-radar project.
-- Creates a single table that stores radar results so they can be shared via
-- a short-link URL like https://gg-radar.app/r/<id>.

create table if not exists public.radar_results (
  id          text         primary key,           -- short slug (nanoid)
  parent_name text         not null,
  result      jsonb        not null,              -- full RadarResponse payload
  created_at  timestamptz  not null default now()
);

-- Public read so anyone with the link can view the result.
alter table public.radar_results enable row level security;

drop policy if exists "radar_results_read_anon" on public.radar_results;
create policy "radar_results_read_anon"
  on public.radar_results
  for select
  to anon, authenticated
  using (true);

-- Server-side writes go through the service-role key (SUPABASE_SERVICE_ROLE_KEY),
-- which bypasses RLS automatically — so no insert policy needed for the API
-- route. If you ever want the browser to write directly, add a policy here.

-- Optional: light cleanup index for the (rare) case you want to enumerate.
create index if not exists radar_results_created_at_idx
  on public.radar_results (created_at desc);
