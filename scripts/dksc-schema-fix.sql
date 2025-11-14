-- ============================================
-- DKSC DB schema normalization to unified spec
-- Safe/idempotent adjustments only
--  - Ensure unified columns exist on matches & upcoming_matches
--  - Keep legacy columns (date, attendee_ids, selection_mode, quarter_scores) nullable
--  - Ensure defaults for JSONB fields
--  - Create indexes if missing
-- ============================================

BEGIN;

-- matches: ensure unified columns exist
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS room_id TEXT;
-- Keep TIMESTAMPTZ for dateISO if present; add if missing
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "dateISO" TIMESTAMPTZ;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "attendeeIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS criterion TEXT DEFAULT 'overall';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "teamCount" INTEGER DEFAULT 2;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT '7v7';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS board JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS formations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "selectionMode" TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS teamids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS draft JSONB;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Ensure JSON default cleanup where columns exist but defaults are NULL
ALTER TABLE public.matches ALTER COLUMN board SET DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ALTER COLUMN formations SET DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ALTER COLUMN teamids SET DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ALTER COLUMN videos SET DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ALTER COLUMN stats SET DEFAULT '{}'::jsonb;
ALTER TABLE public.matches ALTER COLUMN locked SET DEFAULT false;

-- Legacy columns: make nullable if exist (do not drop)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='date'
  ) THEN
    ALTER TABLE public.matches ALTER COLUMN date DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='attendee_ids'
  ) THEN
    ALTER TABLE public.matches ALTER COLUMN attendee_ids DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='selection_mode'
  ) THEN
    ALTER TABLE public.matches ALTER COLUMN selection_mode DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='quarter_scores'
  ) THEN
    ALTER TABLE public.matches ALTER COLUMN quarter_scores DROP NOT NULL;
  END IF;
END $$;

-- Indexes for matches
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON public.matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON public.matches("dateISO");
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON public.matches(created_at);

-- upcoming_matches: ensure unified columns if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='upcoming_matches'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS room_id TEXT;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS "dateISO" TIMESTAMPTZ;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS "attendeeIds" JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS criterion TEXT DEFAULT 'overall';
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS "teamCount" INTEGER DEFAULT 2;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS location JSONB;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT '7v7';
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS board JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS formations JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS "selectionMode" TEXT;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS teamids JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS draft JSONB;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS "teamColors" JSONB DEFAULT NULL;
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

    -- upcoming_matches indexes
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_user_id ON public.upcoming_matches(user_id);
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON public.upcoming_matches(room_id);
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_dateISO ON public.upcoming_matches("dateISO");
  END IF;
END $$;

COMMIT;

-- Optional comments (reassigns/comment upserts)
COMMENT ON COLUMN public.matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';
COMMENT ON COLUMN public.matches."dateISO" IS 'Match date and time with timezone (TIMESTAMPTZ)';
COMMENT ON COLUMN public.matches."attendeeIds" IS 'Array of attendee player IDs (통일된 컬럼명)';
COMMENT ON COLUMN public.matches.room_id IS '팀 공유 방 ID (DKSC용)';
