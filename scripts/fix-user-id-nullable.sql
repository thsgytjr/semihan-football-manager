-- Fix user_id NOT NULL constraint issue
-- The app is designed to work with both user_id (personal) and room_id (team) modes
-- user_id should be nullable to support room-based usage without authentication

-- Make user_id nullable in matches table
ALTER TABLE public.matches ALTER COLUMN user_id DROP NOT NULL;

-- Make user_id nullable in upcoming_matches table (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'upcoming_matches' 
               AND column_name = 'user_id') THEN
        ALTER TABLE public.upcoming_matches ALTER COLUMN user_id DROP NOT NULL;
    END IF;
END $$;

-- Verify the change
SELECT 
    table_name,
    column_name,
    is_nullable,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('matches', 'upcoming_matches')
  AND column_name = 'user_id';
