-- Fix timezone issue: Change date_iso from timestamptz to text
-- This stores the exact datetime string as entered in UI without timezone conversion
-- Run this on all Supabase projects (Hangang, Jindo, Semihan, DKSC)

-- 1. Drop the existing timestamptz column and recreate as text
ALTER TABLE public.upcoming_matches 
  ALTER COLUMN date_iso TYPE text USING date_iso::text;

-- 2. Do the same for matches table if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='matches' AND column_name='date_iso'
  ) THEN
    ALTER TABLE public.matches 
      ALTER COLUMN date_iso TYPE text USING date_iso::text;
  END IF;
END $$;

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';
