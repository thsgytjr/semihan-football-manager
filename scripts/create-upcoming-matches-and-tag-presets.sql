-- scripts/create-upcoming-matches-and-tag-presets.sql
-- Hangang 환경에서 appdb 의존을 제거하기 위해 필요한 핵심 테이블과 함수
-- Supabase SQL Editor 또는 CLI에서 실행하세요.

create extension if not exists "pgcrypto";

-- 1) 예정 경기(upcoming_matches)
create table if not exists public.upcoming_matches (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  title text,
  note text,
  date_iso timestamptz not null,
  location jsonb default '{}'::jsonb,
  snapshot jsonb default '[]'::jsonb,
  participant_ids uuid[] default '{}'::uuid[],
  captain_ids uuid[] default '{}'::uuid[],
  formations jsonb default '[]'::jsonb,
  team_count int not null default 2 check (team_count between 2 and 8),
  is_draft_mode boolean not null default false,
  is_draft_complete boolean not null default false,
  draft_completed_at timestamptz,
  total_cost numeric,
  fees_disabled boolean not null default false,
  team_colors jsonb default '{}'::jsonb,
  criterion text default 'overall',
  status text default 'scheduled',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, id)
);

-- ensure 신규 스키마가 기존 테이블에도 반영되도록 컬럼 보강
do $$ begin
  -- Add title if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='title'
  ) then
    alter table public.upcoming_matches add column title text;
  end if;
  
  -- Add note if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='note'
  ) then
    alter table public.upcoming_matches add column note text;
  end if;
  
  -- Add snapshot if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='snapshot'
  ) then
    alter table public.upcoming_matches add column snapshot jsonb default '[]'::jsonb;
  end if;
  
  -- Add participant_ids if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='participant_ids'
  ) then
    alter table public.upcoming_matches add column participant_ids uuid[] default '{}'::uuid[];
  end if;
  
  -- Add captain_ids if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='captain_ids'
  ) then
    alter table public.upcoming_matches add column captain_ids uuid[] default '{}'::uuid[];
  end if;
  
  -- Add formations if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='formations'
  ) then
    alter table public.upcoming_matches add column formations jsonb default '[]'::jsonb;
  end if;
  
  -- Add team_count if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='team_count'
  ) then
    alter table public.upcoming_matches add column team_count int not null default 2 check (team_count between 2 and 8);
  end if;
  
  -- Add is_draft_mode if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='is_draft_mode'
  ) then
    alter table public.upcoming_matches add column is_draft_mode boolean not null default false;
  end if;
  
  -- Add is_draft_complete if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='is_draft_complete'
  ) then
    alter table public.upcoming_matches add column is_draft_complete boolean not null default false;
  end if;
  
  -- Add draft_completed_at if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='draft_completed_at'
  ) then
    alter table public.upcoming_matches add column draft_completed_at timestamptz;
  end if;
  
  -- Add total_cost if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='total_cost'
  ) then
    alter table public.upcoming_matches add column total_cost numeric;
  end if;
  
  -- Add fees_disabled if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='fees_disabled'
  ) then
    alter table public.upcoming_matches add column fees_disabled boolean not null default false;
  end if;
  
  -- Add team_colors if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='team_colors'
  ) then
    alter table public.upcoming_matches add column team_colors jsonb default '{}'::jsonb;
  end if;
  
  -- Add criterion if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='criterion'
  ) then
    alter table public.upcoming_matches add column criterion text default 'overall';
  end if;
  
  -- Add status if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='status'
  ) then
    alter table public.upcoming_matches add column status text default 'scheduled';
  end if;
  
  -- Add metadata if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='metadata'
  ) then
    alter table public.upcoming_matches add column metadata jsonb default '{}'::jsonb;
  end if;
  
  -- Add location if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='location'
  ) then
    alter table public.upcoming_matches add column location jsonb default '{}'::jsonb;
  end if;
  
  -- Add date_iso if missing (already exists based on your schema)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='upcoming_matches' and column_name='date_iso'
  ) then
    alter table public.upcoming_matches add column date_iso timestamptz not null default now();
  end if;
end $$;

create index if not exists idx_upcoming_matches_room_date on public.upcoming_matches(room_id, date_iso desc);

-- 2) 태그 프리셋(tag_presets)
create table if not exists public.tag_presets (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  name text not null,
  color text not null default 'stone',
  sort_order int not null default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, name)
);

create index if not exists idx_tag_presets_room_sort on public.tag_presets(room_id, sort_order);

-- 3) 앱 설정(app_settings) - 룸 단위 JSON blob 저장
do $$ begin
  if not exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='app_settings'
  ) then
    create table public.app_settings (
      id uuid primary key default gen_random_uuid(),
      room_id text not null unique,
      settings jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

-- 4) 방문자 합계(visit_totals) + 증가 함수
create table if not exists public.visit_totals (
  room_id text primary key,
  total_visits bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- 공통 updated_at 트리거 함수
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 트리거 연결 (이미 존재하면 건너뜀)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_upcoming_matches_updated'
  ) THEN
    CREATE TRIGGER trg_upcoming_matches_updated
      BEFORE UPDATE ON public.upcoming_matches
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tag_presets_updated'
  ) THEN
    CREATE TRIGGER trg_tag_presets_updated
      BEFORE UPDATE ON public.tag_presets
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_app_settings_updated'
  ) THEN
    CREATE TRIGGER trg_app_settings_updated
      BEFORE UPDATE ON public.app_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

-- RLS 설정
alter table public.upcoming_matches enable row level security;
alter table public.tag_presets enable row level security;
alter table public.app_settings enable row level security;
alter table public.visit_totals enable row level security;

-- upcoming_matches 정책
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='upcoming_matches' AND policyname='upcoming_matches_select_all'
  ) THEN
    CREATE POLICY upcoming_matches_select_all ON public.upcoming_matches FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='upcoming_matches' AND policyname='upcoming_matches_write_auth'
  ) THEN
    CREATE POLICY upcoming_matches_write_auth ON public.upcoming_matches
      FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- tag_presets 정책
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tag_presets' AND policyname='tag_presets_select_all'
  ) THEN
    CREATE POLICY tag_presets_select_all ON public.tag_presets FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tag_presets' AND policyname='tag_presets_write_auth'
  ) THEN
    CREATE POLICY tag_presets_write_auth ON public.tag_presets
      FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- app_settings 정책
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='app_settings_select_all'
  ) THEN
    CREATE POLICY app_settings_select_all ON public.app_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='app_settings_write_auth'
  ) THEN
    CREATE POLICY app_settings_write_auth ON public.app_settings
      FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- visit_totals 정책 (select 전체 허용, 쓰기는 service_role)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_totals' AND policyname='visit_totals_select_all'
  ) THEN
    CREATE POLICY visit_totals_select_all ON public.visit_totals FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_totals' AND policyname='visit_totals_service_manage'
  ) THEN
    CREATE POLICY visit_totals_service_manage ON public.visit_totals
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- 방문자 수 증가 함수 (security definer)
create or replace function public.increment_visit_total(p_room_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total bigint;
begin
  insert into public.visit_totals(room_id, total_visits, updated_at)
  values (p_room_id, 1, now())
  on conflict (room_id)
  do update set total_visits = public.visit_totals.total_visits + 1,
               updated_at = now()
  returning public.visit_totals.total_visits into new_total;
  return new_total;
end;
$$;

revoke all on function public.increment_visit_total(text) from public;
grant execute on function public.increment_visit_total(text) to anon, authenticated, service_role;
