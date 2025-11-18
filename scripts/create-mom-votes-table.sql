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

-- 중복 투표 방지: IP + Visitor ID 조합으로 디바이스 식별
-- 같은 와이파이(같은 IP)를 쓰는 여러 디바이스(다른 visitor_id)는 각각 투표 가능
-- NULL 값은 고유 제약에서 제외됨
create unique index if not exists mom_votes_unique_device on public.mom_votes(match_id, ip_hash, visitor_id) 
  where ip_hash is not null and visitor_id is not null;

-- 레거시 호환성: IP만 있거나 Visitor ID만 있는 경우도 중복 방지
-- (기존 데이터와의 호환성을 위해 유지)
create unique index if not exists mom_votes_unique_ip_only on public.mom_votes(match_id, ip_hash) 
  where ip_hash is not null and visitor_id is null;
create unique index if not exists mom_votes_unique_visitor_only on public.mom_votes(match_id, visitor_id) 
  where visitor_id is not null and ip_hash is null;
