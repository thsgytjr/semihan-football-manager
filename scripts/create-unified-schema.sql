-- ============================================
-- Hangang-Football-Manager: Create unified schema from scratch
-- Matches + Upcoming Matches tables with unified columns, defaults, and indexes
-- Safe: IF NOT EXISTS everywhere; can be run multiple times
-- ============================================

-- Enable useful extensions (safe on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- matches
-- ============================================
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  room_id TEXT,
  "dateISO" TIMESTAMPTZ,
  "attendeeIds" JSONB DEFAULT '[]'::jsonb,
  criterion TEXT DEFAULT 'overall',
  "teamCount" INTEGER DEFAULT 2,
  location JSONB,
  mode TEXT DEFAULT '7v7',
  board JSONB DEFAULT '[]'::jsonb,
  formations JSONB DEFAULT '[]'::jsonb,
  "selectionMode" TEXT,
  locked BOOLEAN DEFAULT false,
  videos JSONB DEFAULT '[]'::jsonb,
  teamids JSONB DEFAULT '[]'::jsonb,
  stats JSONB DEFAULT '{}'::jsonb,
  draft JSONB,
  "teamColors" JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for matches
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON public.matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON public.matches("dateISO");
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON public.matches(created_at);

-- Optional comments
COMMENT ON COLUMN public.matches.user_id IS '개인 소유자 ID (Semihan용)';
COMMENT ON COLUMN public.matches.room_id IS '팀 공유 방 ID (DKSC/멀티테넌트 room scope)';
COMMENT ON COLUMN public.matches."dateISO" IS 'Match date and time with timezone (TIMESTAMPTZ)';
COMMENT ON COLUMN public.matches."attendeeIds" IS 'Array of attendee player IDs (통일된 컬럼명)';
COMMENT ON COLUMN public.matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';

-- ============================================
-- upcoming_matches (optional feature)
-- ============================================
CREATE TABLE IF NOT EXISTS public.upcoming_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  room_id TEXT,
  "dateISO" TIMESTAMPTZ,
  "attendeeIds" JSONB DEFAULT '[]'::jsonb,
  criterion TEXT DEFAULT 'overall',
  "teamCount" INTEGER DEFAULT 2,
  location JSONB,
  mode TEXT DEFAULT '7v7',
  board JSONB DEFAULT '[]'::jsonb,
  formations JSONB DEFAULT '[]'::jsonb,
  "selectionMode" TEXT,
  locked BOOLEAN DEFAULT false,
  videos JSONB DEFAULT '[]'::jsonb,
  teamids JSONB DEFAULT '[]'::jsonb,
  stats JSONB DEFAULT '{}'::jsonb,
  draft JSONB,
  "teamColors" JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for upcoming_matches
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_user_id ON public.upcoming_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON public.upcoming_matches(room_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_dateISO ON public.upcoming_matches("dateISO");

-- Optional comments
COMMENT ON COLUMN public.upcoming_matches.user_id IS '개인 소유자 ID (Semihan용)';
COMMENT ON COLUMN public.upcoming_matches.room_id IS '팀 공유 방 ID (DKSC/멀티테넌트 room scope)';
COMMENT ON COLUMN public.upcoming_matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';

-- ============================================
-- (Optional) Enable RLS with permissive starter policies; adjust later as needed
-- ============================================
-- ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.upcoming_matches ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS matches_select_policy ON public.matches;
-- CREATE POLICY matches_select_policy ON public.matches FOR SELECT USING (true);

-- DROP POLICY IF EXISTS upcoming_matches_select_policy ON public.upcoming_matches;
-- CREATE POLICY upcoming_matches_select_policy ON public.upcoming_matches FOR SELECT USING (true);

-- ============================================
-- Done
-- ============================================
