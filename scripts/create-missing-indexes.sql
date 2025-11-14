-- ============================================
-- Create missing indexes for matches / upcoming_matches
-- Run on any project; guarded and idempotent
-- ============================================

-- matches
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON public.matches("dateISO");
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON public.matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON public.matches(created_at);

-- upcoming_matches (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='upcoming_matches'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_user_id ON public.upcoming_matches(user_id);
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON public.upcoming_matches(room_id);
    CREATE INDEX IF NOT EXISTS idx_upcoming_matches_dateISO ON public.upcoming_matches("dateISO");
  END IF;
END $$;
