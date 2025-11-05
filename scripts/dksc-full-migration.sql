-- ============================================
-- DKSC 데이터베이스 마이그레이션 스크립트
-- teamColors 컬럼 추가
-- ============================================

-- 확인된 DKSC 테이블 구조:
-- - matches: id, date, selection_mode, attendee_ids, snapshot, quarter_scores, stats, is_draft_complete, created_at
-- - upcoming_matches: (구조 확인 필요)

-- ============================================
-- STEP 1: matches 테이블에 teamColors 컬럼 추가
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;

-- ============================================
-- STEP 2: upcoming_matches 테이블에 teamColors 컬럼 추가
-- ============================================
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;

-- ============================================
-- STEP 3: 컬럼 코멘트 추가
-- ============================================
COMMENT ON COLUMN matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';
COMMENT ON COLUMN upcoming_matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';

-- ============================================
-- STEP 4: 마이그레이션 완료 확인
-- ============================================
SELECT 
    'matches' as table_name,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'matches'
  AND column_name = 'teamColors'

UNION ALL

SELECT 
    'upcoming_matches' as table_name,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'upcoming_matches'
  AND column_name = 'teamColors';
