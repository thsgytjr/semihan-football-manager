-- ============================================
-- Semihan DB schema normalization to unified spec
-- Safe/idempotent: uses IF EXISTS / IF NOT EXISTS / guarded DO blocks
-- Focus:
--  - attendeeIds: uuid[] -> jsonb '[]'
--  - videos: text[] -> jsonb '[]'
--  - ensure defaults for board/formations/teamids/stats
--  - indexes for matches & upcoming_matches
--  - upcoming_matches columns alignment (add if missing)
-- ============================================

BEGIN;

-- attendeeIds: convert from uuid[] to jsonb in-place if needed (preserves deps)
DO $$
DECLARE
  v_is_array boolean;
BEGIN
  SELECT (data_type = 'ARRAY') INTO v_is_array
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='matches' AND column_name='attendeeIds';

  IF COALESCE(v_is_array, false) THEN
    -- Drop default first to avoid cast error from uuid[] default -> jsonb
    ALTER TABLE public.matches
      ALTER COLUMN "attendeeIds" DROP DEFAULT;
    ALTER TABLE public.matches
      ALTER COLUMN "attendeeIds" TYPE JSONB USING to_jsonb("attendeeIds");
  END IF;
END $$;
ALTER TABLE public.matches ALTER COLUMN "attendeeIds" SET DEFAULT '[]'::jsonb;

-- videos: convert from text[] to jsonb in-place if needed (preserves deps)
DO $$
DECLARE
  v_is_array boolean;
BEGIN
  SELECT (data_type = 'ARRAY') INTO v_is_array
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='matches' AND column_name='videos';

  IF COALESCE(v_is_array, false) THEN
    -- Drop default first to avoid cast error from text[] default -> jsonb
    ALTER TABLE public.matches
      ALTER COLUMN videos DROP DEFAULT;
    ALTER TABLE public.matches
      ALTER COLUMN videos TYPE JSONB USING to_jsonb(videos);
  END IF;
END $$;
ALTER TABLE public.matches ALTER COLUMN videos SET DEFAULT '[]'::jsonb;

-- Ensure jsonb defaults and null cleanup
ALTER TABLE public.matches ALTER COLUMN board SET DEFAULT '[]'::jsonb;
UPDATE public.matches SET board='[]'::jsonb WHERE board IS NULL;

ALTER TABLE public.matches ALTER COLUMN formations SET DEFAULT '[]'::jsonb;
UPDATE public.matches SET formations='[]'::jsonb WHERE formations IS NULL;

ALTER TABLE public.matches ALTER COLUMN teamids SET DEFAULT '[]'::jsonb;
UPDATE public.matches SET teamids='[]'::jsonb WHERE teamids IS NULL;

ALTER TABLE public.matches ALTER COLUMN stats SET DEFAULT '{}'::jsonb;
UPDATE public.matches SET stats='{}'::jsonb WHERE stats IS NULL;

-- Prefer locked default false (do not change existing data)
ALTER TABLE public.matches ALTER COLUMN locked SET DEFAULT false;

-- Create matches indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON public.matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON public.matches("dateISO");
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON public.matches(created_at);

-- upcoming_matches: add/align columns if the table exists
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
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.upcoming_matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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
COMMENT ON COLUMN public.matches.room_id IS '팀 공유 방 ID (DKSC용/Semihan room scope)';
