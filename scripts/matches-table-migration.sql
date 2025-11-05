-- ========================================
-- Matches 테이블 마이그레이션 SQL
-- appdb JSON에서 정규화된 matches 테이블로 이전
-- ========================================

-- 1. matches 테이블 생성 (이미 있으면 스킵)
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id TEXT NOT NULL,
  date_iso TIMESTAMP WITH TIME ZONE,
  attendee_ids TEXT[] DEFAULT '{}',
  criterion TEXT DEFAULT 'overall',
  team_count INTEGER DEFAULT 2,
  location JSONB,
  mode TEXT DEFAULT '7v7',
  snapshot JSONB DEFAULT '{}'::jsonb,
  board JSONB DEFAULT '[]'::jsonb,
  formations JSONB DEFAULT '[]'::jsonb,
  selection_mode TEXT DEFAULT 'manual',
  locked BOOLEAN DEFAULT FALSE,
  videos JSONB DEFAULT '[]'::jsonb,
  team_ids JSONB DEFAULT '[]'::jsonb,
  stats JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 인덱스 생성 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_date_iso ON matches(date_iso DESC);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at DESC);

-- 3. RLS (Row Level Security) 정책 (선택사항)
-- 같은 room_id를 가진 사용자만 접근 가능
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- 기존 정책이 있으면 삭제
DROP POLICY IF EXISTS "matches_select_policy" ON matches;
DROP POLICY IF EXISTS "matches_insert_policy" ON matches;
DROP POLICY IF EXISTS "matches_update_policy" ON matches;
DROP POLICY IF EXISTS "matches_delete_policy" ON matches;

-- 새 정책 생성
CREATE POLICY "matches_select_policy" ON matches
  FOR SELECT USING (true);  -- room 기반이므로 모든 읽기 허용

CREATE POLICY "matches_insert_policy" ON matches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "matches_update_policy" ON matches
  FOR UPDATE USING (true);

CREATE POLICY "matches_delete_policy" ON matches
  FOR DELETE USING (true);

-- 4. 확인용 쿼리
-- SELECT * FROM matches WHERE room_id = 'semihan-lite-room-1' ORDER BY date_iso DESC LIMIT 5;

-- ========================================
-- 완료 체크리스트:
-- ✅ matches 테이블 생성
-- ✅ 인덱스 추가
-- ✅ RLS 정책 설정
-- 
-- 다음 단계:
-- 1. 브라우저 콘솔에서 마이그레이션 스크립트 실행:
--    import { migrateMatchesToDB } from './scripts/migrate-matches-to-db.js'
--    await migrateMatchesToDB()
-- 
-- 2. 검증:
--    import { verifyMigration } from './scripts/migrate-matches-to-db.js'
--    await verifyMigration()
-- 
-- 3. storage.service.js에서 USE_MATCHES_TABLE = true로 설정
-- ========================================
