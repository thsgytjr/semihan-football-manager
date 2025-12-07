-- Add missing columns to upcoming_matches table
-- Run this in Supabase SQL Editor if you already have the table but missing columns

DO $$ BEGIN
  -- Add title if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='title'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN title text;
  END IF;

  -- Add note if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='note'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN note text;
  END IF;

  -- Add location if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='location'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN location jsonb DEFAULT '{}'::jsonb;
  END IF;

  -- Add snapshot if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='snapshot'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN snapshot jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- Add participant_ids if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='participant_ids'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN participant_ids uuid[] DEFAULT '{}'::uuid[];
  END IF;

  -- Add captain_ids if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='captain_ids'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN captain_ids uuid[] DEFAULT '{}'::uuid[];
  END IF;

  -- Add formations if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='formations'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN formations jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- Add team_count if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='team_count'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN team_count int NOT NULL DEFAULT 2 CHECK (team_count BETWEEN 2 AND 8);
  END IF;

  -- Add is_draft_mode if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='is_draft_mode'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN is_draft_mode boolean NOT NULL DEFAULT false;
  END IF;

  -- Add is_draft_complete if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='is_draft_complete'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN is_draft_complete boolean NOT NULL DEFAULT false;
  END IF;

  -- Add draft_completed_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='draft_completed_at'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN draft_completed_at timestamptz;
  END IF;

  -- Add total_cost if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='total_cost'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN total_cost numeric;
  END IF;

  -- Add fees_disabled if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='fees_disabled'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN fees_disabled boolean NOT NULL DEFAULT false;
  END IF;

  -- Add team_colors if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='team_colors'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN team_colors jsonb DEFAULT '{}'::jsonb;
  END IF;

  -- Add criterion if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='criterion'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN criterion text DEFAULT 'overall';
  END IF;

  -- Add status if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='status'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN status text DEFAULT 'scheduled';
  END IF;

  -- Add metadata if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='upcoming_matches' AND column_name='metadata'
  ) THEN
    ALTER TABLE public.upcoming_matches ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
