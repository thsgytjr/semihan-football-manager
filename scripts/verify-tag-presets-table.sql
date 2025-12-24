-- ============================================================================================================
-- TAG_PRESETS 테이블 존재 여부 및 스키마 확인 쿼리
-- ============================================================================================================
-- 이 쿼리를 Supabase Dashboard > SQL Editor에 붙여넣어 실행하세요
--
-- 사용법:
-- 1. Supabase Dashboard > SQL Editor 열기
-- 2. 이 파일 내용 전체 복사 (Cmd+A, Cmd+C)
-- 3. SQL Editor에 붙여넣기 (Cmd+V)
-- 4. Run 버튼 클릭
--
-- 확인할 프로젝트:
-- - Semihan FC: https://supabase.com/dashboard/project/zevkvfsfxxomfxwygcqm
-- - DKSC: https://supabase.com/dashboard/project/lxyrqovzrlgxgmhzytfq
-- - Mission FC: https://supabase.com/dashboard/project/runhjwwjtaybenxatlrt
-- ============================================================================================================

-- 1. tag_presets 테이블이 존재하는지 확인
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE tablename = 'tag_presets';

-- 2. tag_presets 테이블의 컬럼 구조 확인
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'tag_presets'
ORDER BY ordinal_position;

-- 3. tag_presets 테이블의 인덱스 확인
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'tag_presets';

-- 4. tag_presets 테이블의 RLS 정책 확인
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'tag_presets';

-- 5. tag_presets 테이블의 데이터 개수 확인
SELECT COUNT(*) as total_presets FROM public.tag_presets;

-- 6. tag_presets 테이블의 실제 데이터 샘플 (최대 5개)
SELECT 
  id,
  room_id,
  name,
  tags,
  color,
  sort_order,
  created_at
FROM public.tag_presets
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================================================
-- 예상 결과 해석:
-- ============================================================================================================
--
-- [쿼리 1] 테이블 존재 확인:
--   - 결과 있음: tag_presets 테이블이 존재합니다
--   - 결과 없음: 테이블이 생성되지 않았습니다
--
-- [쿼리 2] 컬럼 구조:
--   - 'tags' 컬럼 (jsonb): ✅ 올바른 스키마 (Mission FC 서울 서버)
--   - 'metadata' 컬럼 (jsonb): ❌ 잘못된 스키마 (버그 발생 원인)
--
-- [쿼리 3] 인덱스:
--   - idx_tag_presets_room_id
--   - idx_tag_presets_sort_order
--
-- [쿼리 4] RLS 정책:
--   - tag_presets_select_all (SELECT)
--   - tag_presets_ins_auth (INSERT)
--   - tag_presets_upd_auth (UPDATE)
--   - tag_presets_del_auth (DELETE)
--
-- [쿼리 5-6] 데이터:
--   - 저장된 태그 프리셋 목록 확인
--
-- ============================================================================================================
