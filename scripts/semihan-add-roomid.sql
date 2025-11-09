-- scripts/semihan-add-roomid.sql
-- Ensure matches table has room_id for ROOM-scoped queries
-- Safe to run multiple times

DO $$
BEGIN
  -- Add room_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='room_id'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN room_id text;
  END IF;

  -- Backfill room_id if null using a default convention; adjust short name as needed
  UPDATE public.matches
  SET room_id = COALESCE(room_id, 'semihan-lite-room-1')
  WHERE room_id IS NULL;

  -- Index for performance
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_matches_room_id'
  ) THEN
    CREATE INDEX idx_matches_room_id ON public.matches (room_id);
  END IF;
END $$;

-- Optional: ensure dateISO column exists and is timestamptz
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='dateISO'
  ) THEN
    ALTER TABLE public.matches ADD COLUMN "dateISO" timestamptz;
    -- Migrate from date/date_iso if present
    UPDATE public.matches SET "dateISO" =
      COALESCE(
        CASE WHEN date_iso IS NOT NULL THEN (date_iso AT TIME ZONE 'UTC') END,
        CASE WHEN date IS NOT NULL THEN (date AT TIME ZONE 'UTC') END
      )
    WHERE "dateISO" IS NULL;
  END IF;
END $$;

-- Optional: location TEXT->JSONB migrate if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name='location'
  ) THEN
    BEGIN
      -- Attempt to cast to JSONB if column is TEXT
      PERFORM 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='matches' AND column_name='location' AND data_type='text';
      IF FOUND THEN
        ALTER TABLE public.matches ALTER COLUMN location TYPE jsonb USING (
          CASE
            WHEN location IS NULL THEN NULL
            WHEN jsonb_typeof(location::jsonb) IS NOT NULL THEN location::jsonb
            ELSE jsonb_build_object('name', location)
          END
        );
      END IF;
    EXCEPTION WHEN others THEN
      -- ignore if already JSONB
      NULL;
    END;
  END IF;
END $$;
