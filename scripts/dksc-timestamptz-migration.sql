-- ============================================
-- DKSC 타임존 문제 해결: TIMESTAMP → TIMESTAMPTZ 변경
-- Semihan과 동일한 DB 구조로 통일
-- ============================================

-- 문제: DKSC의 dateISO 컬럼이 TIMESTAMP (타임존 없음) 타입
-- 해결: TIMESTAMPTZ (타임존 포함) 타입으로 변경

BEGIN;

-- ============================================
-- STEP 1: location 컬럼 확인 및 추가/변환
-- ============================================
-- Semihan과 동일하게 location JSONB 컬럼 필요
DO $$
DECLARE
  loc_type TEXT;
BEGIN
  -- location 컬럼이 존재하는지 확인
  SELECT data_type INTO loc_type
  FROM information_schema.columns 
  WHERE table_name = 'matches' AND column_name = 'location';
  
  IF loc_type IS NULL THEN
    -- 컬럼이 없으면 JSONB로 생성
    ALTER TABLE matches ADD COLUMN location JSONB;
    RAISE NOTICE '✅ matches.location 컬럼 추가 완료 (JSONB)';
  ELSIF loc_type = 'text' THEN
    -- TEXT 타입이면 JSONB로 변환 (기존 문자열 데이터를 JSON으로 파싱)
    ALTER TABLE matches 
      ALTER COLUMN location TYPE JSONB 
      USING CASE 
        WHEN location IS NULL OR location = '' THEN NULL
        ELSE location::jsonb
      END;
    RAISE NOTICE '✅ matches.location 타입 변경 완료 (TEXT → JSONB)';
  ELSIF loc_type = 'jsonb' THEN
    RAISE NOTICE 'ℹ️ matches.location이 이미 JSONB 타입입니다';
  ELSE
    RAISE NOTICE 'ℹ️ matches.location 타입: % (변경하지 않음)', loc_type;
  END IF;
END $$;

-- ============================================
-- STEP 2: matches 테이블 - dateISO 컬럼 타입 변경
-- ============================================
-- 기존 TIMESTAMP를 TIMESTAMPTZ로 변경
-- USING 절로 기존 데이터를 UTC로 해석하여 보존
ALTER TABLE matches 
  ALTER COLUMN "dateISO" TYPE TIMESTAMPTZ 
  USING "dateISO" AT TIME ZONE 'UTC';

-- ============================================
-- STEP 3: 인덱스 재생성 (성능 최적화)
-- ============================================
DROP INDEX IF EXISTS idx_matches_dateISO;
CREATE INDEX idx_matches_dateISO ON matches("dateISO");

-- ============================================
-- STEP 4: 코멘트 추가
-- ============================================
COMMENT ON COLUMN matches."dateISO" IS 'Match date and time with timezone (TIMESTAMPTZ)';
COMMENT ON COLUMN matches.location IS 'Match location info (JSONB): {preset, name, address}';

-- ============================================
-- STEP 5: 변경 사항 확인
-- ============================================
DO $$
DECLARE
  matches_type TEXT;
  location_type TEXT;
  location_exists BOOLEAN;
BEGIN
  -- matches 테이블 dateISO 타입 확인
  SELECT data_type INTO matches_type
  FROM information_schema.columns
  WHERE table_name = 'matches' AND column_name = 'dateISO';
  
  -- location 컬럼 존재 및 타입 확인
  SELECT data_type INTO location_type
  FROM information_schema.columns 
  WHERE table_name = 'matches' AND column_name = 'location';
  
  location_exists := location_type IS NOT NULL;
  
  RAISE NOTICE '✅ matches.dateISO 타입: %', matches_type;
  RAISE NOTICE '✅ matches.location 타입: %', COALESCE(location_type, 'NOT FOUND');
  
  IF matches_type = 'timestamp with time zone' AND location_type = 'jsonb' THEN
    RAISE NOTICE '✅ 마이그레이션 성공! DKSC와 Semihan의 DB 구조가 동일해졌습니다.';
  ELSE
    IF matches_type != 'timestamp with time zone' THEN
      RAISE WARNING '⚠️ dateISO 타입 변경이 적용되지 않았습니다. 현재: %', matches_type;
    END IF;
    IF location_type != 'jsonb' THEN
      RAISE WARNING '⚠️ location이 JSONB 타입이 아닙니다. 현재: %', COALESCE(location_type, 'NOT FOUND');
    END IF;
  END IF;
END $$;

COMMIT;

-- ============================================
-- 마이그레이션 완료 후 확인 쿼리
-- ============================================
-- 아래 쿼리를 실행하여 타입이 올바르게 변경되었는지 확인하세요:
/*
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'matches' 
  AND (column_name LIKE '%date%' OR column_name = 'location')
ORDER BY ordinal_position;
*/
