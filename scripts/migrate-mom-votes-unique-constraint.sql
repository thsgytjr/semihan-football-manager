-- scripts/migrate-mom-votes-unique-constraint.sql
-- MOM 투표 중복 방지 제약 조건 마이그레이션 (Visitor ID 단일 식별 체계)
-- 같은 디바이스가 네트워크만 바꿔서 다시 투표하는 시나리오를 차단합니다.
--
-- 실행 순서:
-- 1. Supabase SQL Editor에서 이 스크립트 실행
-- 2. 기존 unique 제약 삭제 후 새로운 조합 제약 생성

-- 1️⃣ 기존 제약 삭제 (이름이 다른 환경도 모두 제거)
drop index if exists public.mom_votes_unique_ip;
drop index if exists public.mom_votes_unique_visitor;
drop index if exists public.mom_votes_unique_device;
drop index if exists public.mom_votes_unique_ip_only;
drop index if exists public.mom_votes_unique_visitor_only;

-- 2️⃣ Visitor ID 기반 단일 제약 생성 (네트워크와 무관하게 1회)
create unique index if not exists mom_votes_unique_visitor on public.mom_votes(match_id, visitor_id)
  where visitor_id is not null;

-- 3️⃣ Visitor ID를 수집하지 못하는 레거시 클라이언트를 위한 fallback
create unique index if not exists mom_votes_unique_ip_fallback on public.mom_votes(match_id, ip_hash)
  where visitor_id is null and ip_hash is not null;

-- 4️⃣ 확인
-- select indexname, indexdef from pg_indexes where tablename = 'mom_votes' and indexname like '%unique%';
