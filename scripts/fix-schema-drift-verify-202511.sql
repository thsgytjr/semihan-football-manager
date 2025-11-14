-- ============================================
-- Fix schema drift to match Hangang canonical schema
-- Safe/idempotent adjustments for Semihan & DKSC
-- - players.positions: ARRAY -> jsonb
-- - visit_logs.id: uuid -> bigint (recreate PK with bigserial)
-- - matches.id: text -> uuid (only if all values castable)
-- - *_created_at/updated_at: timestamp -> timestamptz
-- - Create missing standard indexes
-- ============================================

-- 1) players.positions -> jsonb (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='players'
      AND column_name='positions' AND data_type <> 'jsonb'
  ) THEN
    -- Drop default if any (avoids cast issues)
    EXECUTE 'ALTER TABLE public.players ALTER COLUMN positions DROP DEFAULT';
    -- Convert array to jsonb
    EXECUTE 'ALTER TABLE public.players ALTER COLUMN positions TYPE jsonb USING to_jsonb(positions)';
  END IF;
END$$;

-- 2) visit_logs.id -> bigint (recreate PK, safe if currently uuid)
DO $$
DECLARE
  pk_name text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='visit_logs'
      AND column_name='id' AND data_type='uuid'
  ) THEN
    -- Add new bigint identity column
    EXECUTE 'ALTER TABLE public.visit_logs ADD COLUMN id_tmp bigserial';
    EXECUTE 'ALTER TABLE public.visit_logs ALTER COLUMN id_tmp SET NOT NULL';

    -- Drop existing primary key on visit_logs if present
    SELECT conname INTO pk_name
    FROM pg_constraint
    WHERE conrelid='public.visit_logs'::regclass AND contype='p'
    LIMIT 1;
    IF pk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.visit_logs DROP CONSTRAINT %I', pk_name);
    END IF;

    -- Drop old id and rename id_tmp -> id
    EXECUTE 'ALTER TABLE public.visit_logs DROP COLUMN id';
    EXECUTE 'ALTER TABLE public.visit_logs RENAME COLUMN id_tmp TO id';

    -- Recreate PK
    EXECUTE 'ALTER TABLE public.visit_logs ADD PRIMARY KEY (id)';
  END IF;
END$$;

-- 3) matches.id text -> uuid (only if all rows castable)
DO $$
DECLARE
  invalid_cnt bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches'
      AND column_name='id' AND data_type='text'
  ) THEN
    SELECT COUNT(*) INTO invalid_cnt
    FROM public.matches
    WHERE id IS NOT NULL
      AND NOT (id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

    IF invalid_cnt = 0 THEN
      EXECUTE 'ALTER TABLE public.matches ALTER COLUMN id TYPE uuid USING id::uuid';
    ELSE
      RAISE NOTICE 'Skipping matches.id -> uuid conversion: % non-UUID rows found', invalid_cnt;
    END IF;
  END IF;
END$$;

-- 4) players.created_at/updated_at -> timestamptz (if currently timestamp)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='players'
      AND column_name='created_at' AND data_type='timestamp without time zone'
  ) THEN
    EXECUTE 'ALTER TABLE public.players ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE ''America/Chicago''' ;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='players'
      AND column_name='updated_at' AND data_type='timestamp without time zone'
  ) THEN
    EXECUTE 'ALTER TABLE public.players ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE ''America/Chicago''' ;
  END IF;
END$$;

-- 5) matches.created_at/updated_at -> timestamptz (if currently timestamp)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches'
      AND column_name='created_at' AND data_type='timestamp without time zone'
  ) THEN
    EXECUTE 'ALTER TABLE public.matches ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE ''America/Chicago''' ;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches'
      AND column_name='updated_at' AND data_type='timestamp without time zone'
  ) THEN
    EXECUTE 'ALTER TABLE public.matches ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE ''America/Chicago''' ;
  END IF;
END$$;

-- 6) Standard indexes (idempotent)
-- players
CREATE INDEX IF NOT EXISTS idx_players_created_at ON public.players (created_at);
CREATE INDEX IF NOT EXISTS idx_players_membership ON public.players (membership);
-- appdb
CREATE INDEX IF NOT EXISTS idx_appdb_id ON public.appdb (id);
-- visit_logs
CREATE INDEX IF NOT EXISTS idx_visit_logs_room_id ON public.visit_logs (room_id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_visited_at ON public.visit_logs (visited_at);

-- Done
-- Rerun scripts/schema-verify-summary.sql to confirm schema_in_sync = true
