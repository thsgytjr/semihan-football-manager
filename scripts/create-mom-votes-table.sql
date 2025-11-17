-- scripts/create-mom-votes-table.sql
-- MOM (Man of the Match) 투표 결과 저장 테이블
-- 실행 위치: Supabase SQL Editor

create table if not exists public.mom_votes (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null,
  voter_label text,
  ip_hash text,
  visitor_id text,
  created_at timestamptz not null default now()
);

create index if not exists mom_votes_match_idx on public.mom_votes(match_id);
create index if not exists mom_votes_player_idx on public.mom_votes(player_id);

-- 동일한 IP/디바이스에서 중복 투표 방지 (NULL 값은 고유 제약 제외)
create unique index if not exists mom_votes_unique_ip on public.mom_votes(match_id, ip_hash) where ip_hash is not null;
create unique index if not exists mom_votes_unique_visitor on public.mom_votes(match_id, visitor_id) where visitor_id is not null;
