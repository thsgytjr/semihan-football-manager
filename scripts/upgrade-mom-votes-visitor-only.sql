-- scripts/upgrade-mom-votes-visitor-only.sql
-- MOM 투표 테이블을 Visitor ID 기반 중복 제약으로 일괄 업데이트합니다.
-- 사용 방법: Supabase SQL Editor에서 전체 스크립트를 그대로 실행하세요.
-- 주요 작업:
--   1) visitor_id / ip_hash 별 중복 투표 레코드 자동 정리 (가장 오래된 것만 유지)
--   2) 기존 unique 인덱스 정리
--   3) match_id + visitor_id, match_id + ip_hash(legacy) 제약 재생성

begin;

-- 1️⃣ visitor_id가 있는 레코드 중 중복 제거 (created_at ASC → 가장 오래된 레코드 보존)
with visitor_ranked as (
  select id,
         row_number() over (partition by match_id, visitor_id order by created_at asc, id asc) as rn
  from public.mom_votes
  where visitor_id is not null
)
delete from public.mom_votes
where id in (
  select id from visitor_ranked where rn > 1
);

-- 1️⃣-b legacy: visitor_id 없이 ip_hash만 있는 레코드도 중복 제거
with ip_ranked as (
  select id,
         row_number() over (partition by match_id, ip_hash order by created_at asc, id asc) as rn
  from public.mom_votes
  where visitor_id is null
    and ip_hash is not null
)
delete from public.mom_votes
where id in (
  select id from ip_ranked where rn > 1
);

-- 2️⃣ 기존 인덱스 모두 삭제 (환경별로 이름이 달라도 대비)
drop index if exists public.mom_votes_unique_ip;
drop index if exists public.mom_votes_unique_visitor;
drop index if exists public.mom_votes_unique_device;
drop index if exists public.mom_votes_unique_ip_only;
drop index if exists public.mom_votes_unique_visitor_only;
drop index if exists public.mom_votes_unique_ip_fallback;

-- 3️⃣ Visitor ID 우선 제약 재생성
create unique index if not exists mom_votes_unique_visitor
  on public.mom_votes(match_id, visitor_id)
  where visitor_id is not null;

-- 4️⃣ Visitor ID가 없는 구형 투표만 IP로 1회 허용
create unique index if not exists mom_votes_unique_ip_fallback
  on public.mom_votes(match_id, ip_hash)
  where visitor_id is null and ip_hash is not null;

commit;

-- ✅ 검증용: 필요한 경우 아래 주석을 풀고 현재 인덱스를 확인하세요.
-- select indexname, indexdef from pg_indexes where tablename = 'mom_votes' and indexname like 'mom_votes_unique%';
