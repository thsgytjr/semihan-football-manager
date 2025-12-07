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

-- Visitor ID가 있는 경우: 네트워크와 무관하게 1회만 허용
create unique index if not exists mom_votes_unique_visitor on public.mom_votes(match_id, visitor_id)
  where visitor_id is not null;

-- Visitor ID가 비어 있는 구 데이터: IP를 fallback으로 사용
create unique index if not exists mom_votes_unique_ip_fallback on public.mom_votes(match_id, ip_hash)
  where visitor_id is null and ip_hash is not null;
