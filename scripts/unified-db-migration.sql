-- ============================================
-- 통합 데이터베이스 마이그레이션 스크립트
-- Semihan DB와 DKSC DB를 동일한 구조로 통일
-- 두 데이터베이스 모두 이 스크립트를 실행하세요
-- ============================================

-- ============================================
-- STEP 1: user_id와 room_id 컬럼 추가 (둘 다 nullable)
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS room_id TEXT;

-- ============================================
-- STEP 2: camelCase 컬럼들 추가
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "dateISO" TIMESTAMP;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "attendeeIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS criterion TEXT DEFAULT 'overall';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "teamCount" INTEGER DEFAULT 2;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT '7v7';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS board JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS formations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "selectionMode" TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS teamids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}'::jsonb;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS draft JSONB;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;

-- ============================================
-- STEP 3: 타임스탬프 컬럼
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ============================================
-- STEP 4: 기존 snake_case 데이터를 camelCase로 복사 (데이터 마이그레이션)
-- ============================================
DO $$ 
BEGIN
    -- date_iso → dateISO (Semihan용)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'date_iso'
    ) THEN
        UPDATE matches SET "dateISO" = date_iso WHERE "dateISO" IS NULL AND date_iso IS NOT NULL;
    END IF;

    -- attendee_ids → attendeeIds (Semihan용)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'attendee_ids'
    ) THEN
        UPDATE matches SET "attendeeIds" = attendee_ids WHERE "attendeeIds" = '[]'::jsonb AND attendee_ids IS NOT NULL;
    END IF;

    -- team_count → teamCount (Semihan용)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'team_count'
    ) THEN
        UPDATE matches SET "teamCount" = team_count WHERE "teamCount" = 2 AND team_count IS NOT NULL;
    END IF;

    -- selection_mode → selectionMode (Semihan용)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'selection_mode'
    ) THEN
        UPDATE matches SET "selectionMode" = selection_mode WHERE "selectionMode" IS NULL AND selection_mode IS NOT NULL;
    END IF;

    -- date → dateISO (DKSC용)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'date'
    ) THEN
        UPDATE matches SET "dateISO" = date WHERE "dateISO" IS NULL AND date IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- STEP 5: 기존 snake_case 컬럼들 nullable로 변경 (필요시)
-- ============================================
-- PostgreSQL에서는 컬럼이 없으면 에러가 나므로 DO 블록 사용
DO $$ 
BEGIN
    -- date 컬럼이 있으면 nullable로 변경
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'date'
    ) THEN
        ALTER TABLE matches ALTER COLUMN date DROP NOT NULL;
    END IF;
    
    -- date_iso 컬럼이 있으면 nullable로 변경
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'date_iso'
    ) THEN
        ALTER TABLE matches ALTER COLUMN date_iso DROP NOT NULL;
    END IF;
    
    -- attendee_ids 컬럼이 있으면 nullable로 변경
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'attendee_ids'
    ) THEN
        ALTER TABLE matches ALTER COLUMN attendee_ids DROP NOT NULL;
    END IF;
    
    -- selection_mode 컬럼이 있으면 nullable로 변경
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'matches' AND column_name = 'selection_mode'
    ) THEN
        ALTER TABLE matches ALTER COLUMN selection_mode DROP NOT NULL;
    END IF;
END $$;

-- ============================================
-- STEP 6: 인덱스 추가
-- ============================================
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON matches("dateISO");
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at);

-- ============================================
-- STEP 7: upcoming_matches 테이블도 동일하게 처리
-- ============================================
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS room_id TEXT;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "dateISO" TIMESTAMP;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "attendeeIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS criterion TEXT DEFAULT 'overall';
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "teamCount" INTEGER DEFAULT 2;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT '7v7';
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS board JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS formations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "selectionMode" TEXT;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS teamids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS draft JSONB;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE upcoming_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- upcoming_matches 인덱스
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_user_id ON upcoming_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON upcoming_matches(room_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_dateISO ON upcoming_matches("dateISO");

-- ============================================
-- STEP 8: 코멘트 추가
-- ============================================
COMMENT ON COLUMN matches.user_id IS '개인 소유자 ID (Semihan용)';
COMMENT ON COLUMN matches.room_id IS '팀 공유 방 ID (DKSC용)';
COMMENT ON COLUMN matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';
COMMENT ON COLUMN matches."dateISO" IS 'Match date in ISO format (통일된 컬럼명)';
COMMENT ON COLUMN matches."attendeeIds" IS 'Array of attendee player IDs (통일된 컬럼명)';

COMMENT ON COLUMN upcoming_matches.user_id IS '개인 소유자 ID (Semihan용)';
COMMENT ON COLUMN upcoming_matches.room_id IS '팀 공유 방 ID (DKSC용)';
COMMENT ON COLUMN upcoming_matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';

-- ============================================
-- STEP 9: 마이그레이션 완료 확인
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
  AND column_name IN ('user_id', 'room_id', 'dateISO', 'attendeeIds', 'teamColors', 'selectionMode', 'teamCount')
ORDER BY column_name;

-- ============================================
-- 완료 메시지
-- ============================================
SELECT '✅ 데이터베이스 통합 마이그레이션 완료!' as status,
       'Semihan과 DKSC 모두 동일한 구조를 가지게 되었습니다.' as message;
