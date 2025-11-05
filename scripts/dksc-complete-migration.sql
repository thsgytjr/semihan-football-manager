-- ============================================
-- DKSC 데이터베이스 완전 마이그레이션 스크립트
-- 기존 테이블에 누락된 컬럼들 추가
-- ============================================

-- 현재 DKSC matches 테이블 컬럼:
-- id, date, selection_mode, attendee_ids, snapshot, quarter_scores, stats, is_draft_complete, created_at

-- 필요한 추가 컬럼들:
-- room_id, dateISO, criterion, teamCount, location, mode, board, formations, 
-- selectionMode, locked, videos, teamids, draft, teamColors, updated_at

-- ============================================
-- STEP 1: room_id 컬럼 추가
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS room_id TEXT;
UPDATE matches SET room_id = 'DKSC-lite-room-1' WHERE room_id IS NULL;
ALTER TABLE matches ALTER COLUMN room_id SET DEFAULT 'DKSC-lite-room-1';

-- ============================================
-- STEP 2: attendeeIds 컬럼 추가 (기존 attendee_ids 컬럼의 데이터를 복사)
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "attendeeIds" JSONB DEFAULT '[]'::jsonb;
UPDATE matches SET "attendeeIds" = attendee_ids WHERE "attendeeIds" = '[]'::jsonb;

-- ============================================
-- STEP 3: dateISO 컬럼 추가 (기존 date 컬럼의 데이터를 복사)
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "dateISO" TIMESTAMP;
UPDATE matches SET "dateISO" = date WHERE "dateISO" IS NULL;

-- ============================================
-- STEP 4: 매치 설정 관련 컬럼 추가
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS criterion TEXT DEFAULT 'overall';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "teamCount" INTEGER DEFAULT 2;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT '7v7';

-- ============================================
-- STEP 5: 매치 데이터 컬럼 추가
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS board JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS formations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "selectionMode" TEXT;
UPDATE matches SET "selectionMode" = selection_mode WHERE "selectionMode" IS NULL;

-- ============================================
-- STEP 6: 매치 상태 및 추가 데이터 컬럼
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS teamids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS draft JSONB;

-- ============================================
-- STEP 7: teamColors 컬럼 추가
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;

-- ============================================
-- STEP 8: updated_at 컬럼 추가
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ============================================
-- STEP 9: upcoming_matches 테이블도 동일하게 업데이트
-- ============================================
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS room_id TEXT DEFAULT 'DKSC-lite-room-1';
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "attendeeIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "dateISO" TIMESTAMP;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS criterion TEXT DEFAULT 'overall';
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "teamCount" INTEGER DEFAULT 2;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT '7v7';
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS board JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS formations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "selectionMode" TEXT;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS teamids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS draft JSONB;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ============================================
-- STEP 10: 인덱스 추가
-- ============================================
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON matches("dateISO");
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON upcoming_matches(room_id);

-- ============================================
-- STEP 11: 코멘트 추가
-- ============================================
COMMENT ON COLUMN matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';
COMMENT ON COLUMN upcoming_matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';

-- ============================================
-- STEP 12: 마이그레이션 완료 확인
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
  AND column_name IN ('room_id', 'attendeeIds', 'dateISO', 'teamColors', 'selectionMode', 'teamCount')
ORDER BY column_name;
