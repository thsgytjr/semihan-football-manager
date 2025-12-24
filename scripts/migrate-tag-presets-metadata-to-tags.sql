-- ============================================================================================================
-- TAG_PRESETS 스키마 마이그레이션: metadata → tags
-- ============================================================================================================
-- 이 스크립트는 기존 tag_presets 테이블의 'metadata' 컬럼을 'tags' 컬럼으로 변경합니다.
--
-- 사용 대상: Semihan FC, DKSC 등 기존 팀들
-- 사유: 코드가 'tags' 컬럼을 사용하도록 수정되었으나 기존 DB는 'metadata' 컬럼을 사용 중
--
-- 사용법:
-- 1. Supabase Dashboard > SQL Editor 열기
-- 2. 이 파일 내용 전체 복사 후 붙여넣기
-- 3. Run 버튼 클릭
-- ============================================================================================================

BEGIN;

-- 1. 기존 데이터 백업 확인
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.tag_presets;
  RAISE NOTICE '현재 tag_presets 테이블에 % 개의 레코드가 있습니다', row_count;
END $$;

-- 2. 'metadata' 컬럼이 존재하는지 확인
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'tag_presets' 
      AND column_name = 'metadata'
  ) THEN
    RAISE NOTICE '✅ metadata 컬럼이 존재합니다. 마이그레이션을 시작합니다.';
    
    -- 3. 'tags' 컬럼 추가 (아직 없다면)
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'tag_presets' 
        AND column_name = 'tags'
    ) THEN
      ALTER TABLE public.tag_presets 
      ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;
      RAISE NOTICE '✅ tags 컬럼을 추가했습니다.';
    ELSE
      RAISE NOTICE 'ℹ️  tags 컬럼이 이미 존재합니다.';
    END IF;
    
    -- 4. 데이터 마이그레이션: metadata → tags
    UPDATE public.tag_presets 
    SET tags = COALESCE(metadata, '[]'::jsonb)
    WHERE tags IS NULL OR tags = '[]'::jsonb;
    
    RAISE NOTICE '✅ metadata 데이터를 tags로 복사했습니다.';
    
    -- 5. metadata 컬럼 삭제
    ALTER TABLE public.tag_presets 
    DROP COLUMN IF EXISTS metadata;
    
    RAISE NOTICE '✅ metadata 컬럼을 삭제했습니다.';
    
  ELSE
    RAISE NOTICE '⚠️  metadata 컬럼이 존재하지 않습니다. 이미 마이그레이션되었거나 새로운 스키마입니다.';
  END IF;
END $$;

-- 6. 최종 스키마 확인
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'tag_presets'
ORDER BY ordinal_position;

-- 7. 마이그레이션 후 데이터 확인
SELECT 
  id,
  room_id,
  name,
  tags,
  color,
  sort_order
FROM public.tag_presets
ORDER BY created_at DESC
LIMIT 5;

COMMIT;

-- ============================================================================================================
-- 마이그레이션 완료!
-- ============================================================================================================
-- 이제 코드가 정상적으로 작동할 것입니다.
-- Vercel 배포가 완료되면 태그 프리셋 생성이 가능합니다.
-- ============================================================================================================
