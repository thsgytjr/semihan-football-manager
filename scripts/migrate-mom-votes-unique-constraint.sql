-- scripts/migrate-mom-votes-unique-constraint.sql
-- MOM 투표 중복 방지 제약 조건 마이그레이션
-- 같은 와이파이(IP)를 쓰는 여러 디바이스가 각각 투표할 수 있도록 개선
--
-- 실행 순서:
-- 1. Supabase SQL Editor에서 이 스크립트 실행
-- 2. 기존 unique 제약 삭제 후 새로운 조합 제약 생성

-- 1️⃣ 기존 제약 삭제
drop index if exists public.mom_votes_unique_ip;
drop index if exists public.mom_votes_unique_visitor;

-- 2️⃣ 새로운 제약 생성: IP + Visitor ID 조합
-- 같은 와이파이(같은 IP)를 쓰는 여러 디바이스(다른 visitor_id)는 각각 투표 가능
create unique index if not exists mom_votes_unique_device on public.mom_votes(match_id, ip_hash, visitor_id) 
  where ip_hash is not null and visitor_id is not null;

-- 3️⃣ 레거시 호환성: IP만 있거나 Visitor ID만 있는 경우도 중복 방지
-- (혹시 모를 기존 데이터와의 호환성을 위해 유지)
create unique index if not exists mom_votes_unique_ip_only on public.mom_votes(match_id, ip_hash) 
  where ip_hash is not null and visitor_id is null;

create unique index if not exists mom_votes_unique_visitor_only on public.mom_votes(match_id, visitor_id) 
  where visitor_id is not null and ip_hash is null;

-- 4️⃣ 확인
-- 아래 쿼리로 제약 조건이 제대로 생성되었는지 확인
-- select indexname, indexdef from pg_indexes where tablename = 'mom_votes' and indexname like '%unique%';
