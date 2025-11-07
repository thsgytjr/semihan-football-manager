-- ============================================
-- quarterScores 컬럼 추가
-- 3팀 이상 드래프트에서 쿼터별 점수 저장용
-- ============================================

-- quarterScores 컬럼 추가 (JSONB 배열: [[q1,q2,q3,q4], [q1,q2,q3,q4], ...])
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "quarterScores" JSONB DEFAULT NULL;

-- 기존 draft.quarterScores 데이터가 있으면 최상위로 복사
UPDATE matches 
SET "quarterScores" = draft->'quarterScores'
WHERE draft IS NOT NULL 
  AND draft ? 'quarterScores' 
  AND "quarterScores" IS NULL;

-- 인덱스 추가 (선택사항 - 쿼터점수로 검색할 경우)
-- CREATE INDEX IF NOT EXISTS idx_matches_quarterscores ON matches USING GIN ("quarterScores");

COMMENT ON COLUMN matches."quarterScores" IS '쿼터별 점수 배열: [[team1_q1,q2,q3,q4], [team2_q1,q2,q3,q4], ...]';
