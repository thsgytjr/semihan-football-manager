-- ============================================
-- DKSC date 컬럼 NOT NULL 제약조건 제거
-- ============================================

-- date 컬럼을 nullable로 변경
ALTER TABLE matches ALTER COLUMN date DROP NOT NULL;

-- upcoming_matches도 동일하게 처리
ALTER TABLE upcoming_matches ALTER COLUMN date DROP NOT NULL;

-- 확인
SELECT 
    table_name,
    column_name, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name IN ('matches', 'upcoming_matches')
  AND column_name = 'date';
