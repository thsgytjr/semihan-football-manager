-- ========================================
-- Supabase Migration SQL
-- 선수 관리 시스템 업데이트
-- ========================================
-- 
-- 🚨 중요: 이 SQL을 각 팀의 Supabase 프로젝트에서 실행하세요!
-- 
-- 1. 세미한 FC Supabase 프로젝트 → SQL Editor → 이 파일 실행
-- 2. DKSC Supabase 프로젝트 → SQL Editor → 이 파일 실행
-- 
-- 두 팀 모두 같은 테이블 구조(players)를 사용하지만
-- 별도의 Supabase 프로젝트이므로 각각 실행 필요
-- ========================================

-- 1. players 테이블에 새 컬럼 추가
-- positions: 선수의 여러 포지션을 저장하는 배열 (예: ["LW", "ST", "RW"])
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS positions TEXT[] DEFAULT '{}';

-- status: 선수 상태 (active, recovering, inactive, suspended, nocontact)
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- tags: 커스텀 태그 JSON 배열 (예: [{"name":"Old Boys","color":"red"}])
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- 2. 기존 position 데이터를 positions 배열로 마이그레이션
-- 기존 단일 포지션이 있으면 배열로 변환
UPDATE players 
SET positions = ARRAY[position]::TEXT[]
WHERE position IS NOT NULL 
  AND position != '' 
  AND (positions IS NULL OR array_length(positions, 1) IS NULL);

-- 3. 인덱스 추가 (성능 향상)
-- status로 필터링할 때 성능 향상
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);

-- tags로 검색할 때 성능 향상 (GIN 인덱스)
CREATE INDEX IF NOT EXISTS idx_players_tags ON players USING GIN (tags);

-- 4. appdb 테이블의 data 컬럼에 tagPresets가 저장됨
-- (이미 JSONB 타입이므로 별도 수정 불필요)

-- 5. 확인용 쿼리 (실행 후 데이터 확인)
-- SELECT id, name, position, positions, status, tags FROM players LIMIT 5;

-- 6. 제약 조건 추가
-- status 값 검증
ALTER TABLE players 
ADD CONSTRAINT check_player_status 
CHECK (status IN ('active', 'recovering', 'inactive', 'suspended', 'nocontact'));

-- ========================================
-- 완료 체크리스트:
-- ✅ 세미한 FC Supabase 프로젝트에서 실행
-- ✅ DKSC Supabase 프로젝트에서 실행
-- 
-- 주의사항:
-- 1. 기존 데이터는 보존됩니다
-- 2. position 컬럼은 하위 호환성을 위해 유지됩니다
-- 3. 각 프로젝트에서 한 번씩만 실행하세요
-- ========================================
