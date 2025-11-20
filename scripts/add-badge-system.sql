-- scripts/add-badge-system.sql
-- 선수 챌린지 뱃지 시스템을 위한 기본 스키마
-- Supabase SQL Editor 또는 CLI로 실행하세요.

create extension if not exists "pgcrypto";

create table if not exists badge_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text default 'general',
  tier smallint default 1,
  icon text default '🏅',
  color_primary text default '#10b981',
  color_secondary text default '#34d399',
  has_numeric_value boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists player_badges (
  id bigserial primary key,
  player_id uuid not null,
  badge_id uuid not null references badge_definitions(id) on delete cascade,
  numeric_value integer,
  match_id uuid,
  awarded_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

create table if not exists player_badge_progress (
  id bigserial primary key,
  player_id uuid not null,
  badge_slug text not null,
  current_value integer not null default 0,
  last_match_id uuid,
  last_event_at timestamptz,
  updated_at timestamptz default now(),
  unique(player_id, badge_slug)
);

create index if not exists idx_player_badges_player on player_badges(player_id);
create index if not exists idx_player_badges_badge on player_badges(badge_id);
create index if not exists idx_badge_progress_player on player_badge_progress(player_id);

alter table badge_definitions enable row level security;
alter table player_badges enable row level security;
alter table player_badge_progress enable row level security;

create policy "Public read badge defs"
  on badge_definitions
  for select
  using (true);

create policy "Service insert/update badge defs"
  on badge_definitions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Public read player badges"
  on player_badges
  for select
  using (true);

create policy "Service manage player badges"
  on player_badges
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Public read badge progress"
  on player_badge_progress
  for select
  using (true);

create policy "Service manage badge progress"
  on player_badge_progress
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace view player_badges_enriched as
select
  pb.id,
  pb.player_id,
  pb.badge_id,
  pb.numeric_value,
  pb.match_id,
  pb.awarded_at,
  pb.metadata,
  bd.slug,
  bd.name,
  bd.description,
  bd.category,
  bd.tier,
  bd.icon,
  bd.color_primary,
  bd.color_secondary,
  bd.has_numeric_value
from player_badges pb
join badge_definitions bd on bd.id = pb.badge_id;
