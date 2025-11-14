-- scripts/add-match-extended-columns.sql
-- Adds newer app columns to public.matches if they don't exist yet.
-- Columns are camelCase and thus must be quoted.

DO $$
BEGIN
  -- snapshot jsonb
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='snapshot'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN snapshot jsonb;
    COMMENT ON COLUMN public.matches.snapshot IS 'Roster snapshot used for quick attendance';
  END IF;

  -- quarterScores jsonb
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='quarterScores'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN "quarterScores" jsonb;
    COMMENT ON COLUMN public.matches."quarterScores" IS 'Per-quarter scoring breakdown';
  END IF;

  -- multiField boolean
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='multiField'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN "multiField" boolean DEFAULT false;
    COMMENT ON COLUMN public.matches."multiField" IS 'Enable 2-field mode scheduling and matchups';
  END IF;

  -- gameMatchups jsonb
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='gameMatchups'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN "gameMatchups" jsonb;
    COMMENT ON COLUMN public.matches."gameMatchups" IS 'Per-game field matchups structure';
  END IF;
END
$$;