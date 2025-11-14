-- ============================================
-- Optional: create upcoming_matches table if missing
-- Use this only if you want to enable the "upcoming matches" feature
-- Safe: no-op if table already exists
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='upcoming_matches'
  ) THEN
    CREATE TABLE public.upcoming_matches (
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

    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_user_id ON public.upcoming_matches(user_id);
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON public.upcoming_matches(room_id);
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_dateISO ON public.upcoming_matches("dateISO");
  END IF;
END $$;
