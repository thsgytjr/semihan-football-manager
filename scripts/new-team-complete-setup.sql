-- ============================================================================================================
-- NEW TEAM COMPLETE DATABASE SETUP
-- ============================================================================================================
-- Production-ready schema for deploying a new football manager app instance
-- Includes all tables, columns, indexes, RLS policies, and fixes from Semihan/DKSC/Hangang deployments
-- 
-- INSTRUCTIONS:
-- 1. Replace 'NEWTEAM' with your team's shortname (e.g., 'REDWINGS', 'TIGERS', etc.)
-- 2. Replace 'NewTeam Football Manager' with your team's full app name
-- 3. Run this entire script in Supabase SQL Editor
-- 4. Verify with: SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- 
-- CHANGELOG:
-- - ✅ Fixed user_id as NULLABLE (not NOT NULL) - supports room-based multi-tenant mode
-- - ✅ All date columns use TIMESTAMPTZ for proper timezone handling
-- - ✅ Added quarterScores, multiField, gameMatchups for advanced match features
-- - ✅ Added fees column for pitch cost tracking
-- - ✅ Added phone_model to visit_logs for device analytics
-- - ✅ Unified schema across all 3 existing teams (Semihan, DKSC, Hangang)
-- - ✅ Complete RLS policies for security
-- - ✅ All necessary indexes for performance
-- ============================================================================================================

BEGIN;

-- ============================================================================================================
-- SECTION 1: EXTENSIONS & UTILITIES
-- ============================================================================================================

-- Required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reusable trigger function for auto-updating updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_updated_at_column() IS 'Auto-updates the updated_at column on row modification';

-- ============================================================================================================
-- SECTION 2: CORE DATA TABLES
-- ============================================================================================================

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: players
-- Stores all player information including stats, membership, positions, and photo URLs
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position TEXT,                                    -- Legacy single position (kept for compatibility)
  positions JSONB DEFAULT '[]'::jsonb,              -- Modern multi-position support
  membership TEXT,                                  -- e.g., '정회원', '준회원', '게스트'
  origin TEXT DEFAULT 'none',                       -- Player origin/source
  status TEXT DEFAULT 'active',                     -- 'active', 'inactive', 'retired'
  tags JSONB DEFAULT '[]'::jsonb,                   -- Custom tags for filtering/grouping
  photo_url TEXT,                                   -- Supabase storage URL for player photo
  stats JSONB DEFAULT '{}'::jsonb,                  -- Player statistics and ratings
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_created_at ON public.players(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_status ON public.players(status);
CREATE INDEX IF NOT EXISTS idx_players_membership ON public.players(membership);
CREATE INDEX IF NOT EXISTS idx_players_name ON public.players(name);
CREATE INDEX IF NOT EXISTS idx_players_tags ON public.players USING GIN (tags);

-- Enforce status domain (including system account)
ALTER TABLE public.players 
DROP CONSTRAINT IF EXISTS check_player_status;

ALTER TABLE public.players 
ADD CONSTRAINT check_player_status 
CHECK (status IN ('active', 'recovering', 'inactive', 'suspended', 'nocontact', 'system'));

-- Auto-update trigger
DROP TRIGGER IF EXISTS trg_players_updated_at ON public.players;
CREATE TRIGGER trg_players_updated_at 
  BEFORE UPDATE ON public.players
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- Public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='players' AND policyname='players_select_all'
  ) THEN
    CREATE POLICY players_select_all ON public.players 
      FOR SELECT USING (true);
  END IF;

  -- Authenticated users can insert
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='players' AND policyname='players_ins_auth'
  ) THEN
    CREATE POLICY players_ins_auth ON public.players 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- Authenticated users can update
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='players' AND policyname='players_upd_auth'
  ) THEN
    CREATE POLICY players_upd_auth ON public.players 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  -- Authenticated users can delete
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='players' AND policyname='players_del_auth'
  ) THEN
    CREATE POLICY players_del_auth ON public.players 
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

COMMENT ON TABLE public.players IS 'Player roster with stats, positions, and membership info';
COMMENT ON COLUMN public.players.photo_url IS 'URL to player photo in Supabase storage (bucket: player-photos)';

-- Ensure exactly one canonical system account exists (safe on empty tables)
WITH canonical AS (
  SELECT id
  FROM (
    SELECT id, created_at FROM public.players WHERE status = 'system'
    UNION ALL
    SELECT id, created_at FROM public.players WHERE status <> 'system' AND LOWER(name) = 'system account'
  ) merged
  ORDER BY created_at NULLS LAST
  LIMIT 1
)
UPDATE public.players
SET
  status = 'system',
  name = 'System Account',
  tags = '[]'::jsonb,
  origin = 'none',
  membership = COALESCE(membership, 'guest')
WHERE id IN (SELECT id FROM canonical);

UPDATE public.players
SET status = 'inactive'
WHERE status = 'system'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id
      FROM (
        SELECT id, created_at FROM public.players WHERE status = 'system'
        UNION ALL
        SELECT id, created_at FROM public.players WHERE status <> 'system' AND LOWER(name) = 'system account'
      ) merged
      ORDER BY created_at NULLS LAST
      LIMIT 1
    ) canonical_keep
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_players_system_account ON public.players(status) WHERE status = 'system';

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: appdb
-- Key-value store for application configuration and state
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appdb (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appdb_id ON public.appdb(id);

ALTER TABLE public.appdb ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_select_all'
  ) THEN
    CREATE POLICY appdb_select_all ON public.appdb 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_upsert_auth'
  ) THEN
    CREATE POLICY appdb_upsert_auth ON public.appdb 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_update_auth'
  ) THEN
    CREATE POLICY appdb_update_auth ON public.appdb 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;

COMMENT ON TABLE public.appdb IS 'Application-level key-value store for configuration and state';

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: visit_logs
-- Tracks visitor analytics including device, browser, and location information
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visit_logs (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT,
  room_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,                                 -- 'mobile', 'tablet', 'desktop'
  browser TEXT,
  os TEXT,
  phone_model TEXT,                                 -- ✅ Added for detailed device tracking
  visited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_logs_room_id ON public.visit_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_visited_at ON public.visit_logs(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_logs_phone_model ON public.visit_logs(phone_model);
CREATE INDEX IF NOT EXISTS idx_visit_logs_visitor_id ON public.visit_logs(visitor_id);

ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='visit_logs' AND policyname='visit_logs_select_all'
  ) THEN
    CREATE POLICY visit_logs_select_all ON public.visit_logs 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='visit_logs' AND policyname='visit_logs_insert_all'
  ) THEN
    CREATE POLICY visit_logs_insert_all ON public.visit_logs 
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.visit_logs IS 'Analytics for tracking app visits and user devices';

-- ============================================================================================================
-- SECTION 3: SETTINGS TABLES
-- ============================================================================================================

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: settings
-- Application-wide settings and feature flags
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings(key);

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.settings;
CREATE TRIGGER trg_settings_updated_at 
  BEFORE UPDATE ON public.settings
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='settings' AND policyname='settings_select_all'
  ) THEN
    CREATE POLICY settings_select_all ON public.settings 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='settings' AND policyname='settings_update_all'
  ) THEN
    CREATE POLICY settings_update_all ON public.settings 
      FOR UPDATE USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='settings' AND policyname='settings_insert_all'
  ) THEN
    CREATE POLICY settings_insert_all ON public.settings 
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.settings IS 'Application-wide settings and feature flags';

-- Default app settings (⚠️ CUSTOMIZE THIS FOR YOUR TEAM)
INSERT INTO public.settings (key, value)
VALUES (
  'app_settings',
  '{
    "appTitle": "JindoFC-FM",
    "appName": "JindoFC Football Manager",
    "seasonRecapEnabled": true,
    "features": {
      "players": true,
      "planner": true,
      "draft": true,
      "formation": true,
      "stats": true,
      "accounting": true,
      "analytics": true
    }
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: membership_settings
-- Customizable membership types with badge colors
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.membership_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,                        -- e.g., '정회원', '준회원', '게스트'
  badge TEXT,                                        -- Badge text (e.g., 'G', '준')
  badge_color TEXT DEFAULT 'stone',                 -- Tailwind color name
  deletable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_settings_name ON public.membership_settings(name);
CREATE INDEX IF NOT EXISTS idx_membership_settings_sort_order ON public.membership_settings(sort_order);

DROP TRIGGER IF EXISTS trg_membership_settings_updated_at ON public.membership_settings;
CREATE TRIGGER trg_membership_settings_updated_at 
  BEFORE UPDATE ON public.membership_settings
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.membership_settings ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_select'
  ) THEN
    CREATE POLICY membership_select ON public.membership_settings 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_insert_auth'
  ) THEN
    CREATE POLICY membership_insert_auth ON public.membership_settings 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_update_auth'
  ) THEN
    CREATE POLICY membership_update_auth ON public.membership_settings 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_delete_auth'
  ) THEN
    CREATE POLICY membership_delete_auth ON public.membership_settings 
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

COMMENT ON TABLE public.membership_settings IS 'Customizable membership types and badge configurations';

-- Default membership types (⚠️ CUSTOMIZE THIS FOR YOUR TEAM)
INSERT INTO public.membership_settings (name, badge, badge_color, deletable, sort_order)
VALUES 
  ('정회원', NULL, 'emerald', false, 1),
  ('준회원', '준', 'amber', true, 2),
  ('게스트', 'G', 'rose', true, 3)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================================================
-- SECTION 4: MATCH TABLES
-- ============================================================================================================

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: matches
-- Historical matches with complete game data, stats, and team configurations
-- ✅ CRITICAL FIXES APPLIED:
-- - user_id is NULLABLE (supports room_id multi-tenant mode)
-- - All date columns use TIMESTAMPTZ
-- - Added quarterScores, multiField, gameMatchups, fees
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                                     -- ✅ NULLABLE - personal owner ID (Semihan mode)
  room_id TEXT,                                     -- Team shared room ID (multi-tenant mode)
  "dateISO" TIMESTAMPTZ,                            -- ✅ TIMESTAMPTZ for timezone support
  "attendeeIds" JSONB DEFAULT '[]'::jsonb,          -- Array of player UUIDs who attended
  criterion TEXT DEFAULT 'overall',                 -- Balancing criterion for team assignment
  "teamCount" INTEGER DEFAULT 2,                    -- Number of teams (2-4)
  location JSONB,                                   -- Location info: {preset, name, address}
  mode TEXT DEFAULT '7v7',                          -- Game mode: '5v5', '7v7', '11v11'
  snapshot JSONB DEFAULT '{}'::jsonb,               -- Team compositions snapshot
  board JSONB DEFAULT '[]'::jsonb,                  -- Draft board state
  formations JSONB DEFAULT '[]'::jsonb,             -- Team formations
  "selectionMode" TEXT,                             -- 'manual', 'draft', 'random'
  locked BOOLEAN DEFAULT false,                     -- Lock match from editing
  videos JSONB DEFAULT '[]'::jsonb,                 -- Video URLs
  teamids JSONB DEFAULT '[]'::jsonb,                -- Team IDs (lowercase for DB compatibility)
  stats JSONB DEFAULT '{}'::jsonb,                  -- Goals/assists stats
  draft JSONB,                                      -- Draft-specific data (captain points, etc.)
  "quarterScores" JSONB,                            -- ✅ Quarter-by-quarter scores
  "teamColors" JSONB DEFAULT NULL,                  -- ✅ Team color customization
  fees JSONB,                                       -- ✅ Match fee breakdown by player
  "multiField" BOOLEAN DEFAULT false,               -- ✅ Multi-field mode (2+ games simultaneously)
  "gameMatchups" JSONB,                             -- ✅ Game-by-game matchups for multi-field
  "statusOverride" TEXT,                            -- ✅ Manual LIVE/UPDATING badge override
  "isVoided" BOOLEAN DEFAULT false,                 -- ✅ Accounting void flag
  "voidReason" TEXT,
  "voidedAt" TIMESTAMPTZ,
  "voidedBy" UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON public.matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON public.matches("dateISO" DESC);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON public.matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_locked ON public.matches(locked);

DROP TRIGGER IF EXISTS trg_matches_updated_at ON public.matches;
CREATE TRIGGER trg_matches_updated_at 
  BEFORE UPDATE ON public.matches
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='matches' AND policyname='matches_select_all'
  ) THEN
    CREATE POLICY matches_select_all ON public.matches 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='matches' AND policyname='matches_ins_auth'
  ) THEN
    CREATE POLICY matches_ins_auth ON public.matches 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='matches' AND policyname='matches_upd_auth'
  ) THEN
    CREATE POLICY matches_upd_auth ON public.matches 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='matches' AND policyname='matches_del_auth'
  ) THEN
    CREATE POLICY matches_del_auth ON public.matches 
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

COMMENT ON TABLE public.matches IS 'Historical matches with complete game data and statistics';
COMMENT ON COLUMN public.matches.user_id IS 'Personal owner ID (Semihan mode) - NULLABLE to support room_id mode';
COMMENT ON COLUMN public.matches.room_id IS 'Team shared room ID for multi-tenant deployments';
COMMENT ON COLUMN public.matches."dateISO" IS 'Match date/time with timezone (TIMESTAMPTZ)';
COMMENT ON COLUMN public.matches.fees IS 'Fee breakdown: {baseCost, perPlayerCost, guestSurcharge, playerFees: {playerId: amount}}';
COMMENT ON COLUMN public.matches."multiField" IS 'True if multiple games played simultaneously on different fields';
COMMENT ON COLUMN public.matches."statusOverride" IS 'Manual override for match status badge: null=auto, live=force LIVE, updating=force UPDATING, off=hide badge';
COMMENT ON COLUMN public.matches."isVoided" IS 'TRUE if match should be excluded from accounting totals (VOID)';
COMMENT ON COLUMN public.matches."voidReason" IS 'Optional free-text reason for VOID action';
COMMENT ON COLUMN public.matches."voidedAt" IS 'Timestamp when VOID was applied or cleared';
COMMENT ON COLUMN public.matches."voidedBy" IS 'Supabase auth user who performed the VOID action';

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: upcoming_matches
-- Scheduled future matches with draft and team configuration
-- Same schema as matches table for consistency
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.upcoming_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                                     -- ✅ NULLABLE
  room_id TEXT,
  "dateISO" TIMESTAMPTZ,                            -- ✅ TIMESTAMPTZ
  "attendeeIds" JSONB DEFAULT '[]'::jsonb,
  criterion TEXT DEFAULT 'overall',
  "teamCount" INTEGER DEFAULT 2,
  location JSONB,
  mode TEXT DEFAULT '7v7',
  snapshot JSONB DEFAULT '{}'::jsonb,
  board JSONB DEFAULT '[]'::jsonb,
  formations JSONB DEFAULT '[]'::jsonb,
  "selectionMode" TEXT,
  locked BOOLEAN DEFAULT false,
  videos JSONB DEFAULT '[]'::jsonb,
  teamids JSONB DEFAULT '[]'::jsonb,
  stats JSONB DEFAULT '{}'::jsonb,
  draft JSONB,
  "quarterScores" JSONB,
  "teamColors" JSONB DEFAULT NULL,
  fees JSONB,
  "multiField" BOOLEAN DEFAULT false,
  "gameMatchups" JSONB,
  status TEXT DEFAULT 'upcoming',                   -- 'upcoming', 'drafting', 'completed'
  "isDraftMode" BOOLEAN DEFAULT false,
  "isDraftComplete" BOOLEAN DEFAULT false,
  "captainIds" JSONB DEFAULT '[]'::jsonb,           -- Captain selections for draft mode
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upcoming_matches_user_id ON public.upcoming_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_room_id ON public.upcoming_matches(room_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_dateISO ON public.upcoming_matches("dateISO" ASC);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_status ON public.upcoming_matches(status);

DROP TRIGGER IF EXISTS trg_upcoming_matches_updated_at ON public.upcoming_matches;
CREATE TRIGGER trg_upcoming_matches_updated_at 
  BEFORE UPDATE ON public.upcoming_matches
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.upcoming_matches ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='upcoming_matches' AND policyname='upcoming_matches_select_all'
  ) THEN
    CREATE POLICY upcoming_matches_select_all ON public.upcoming_matches 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='upcoming_matches' AND policyname='upcoming_matches_ins_auth'
  ) THEN
    CREATE POLICY upcoming_matches_ins_auth ON public.upcoming_matches 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='upcoming_matches' AND policyname='upcoming_matches_upd_auth'
  ) THEN
    CREATE POLICY upcoming_matches_upd_auth ON public.upcoming_matches 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='upcoming_matches' AND policyname='upcoming_matches_del_auth'
  ) THEN
    CREATE POLICY upcoming_matches_del_auth ON public.upcoming_matches 
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

COMMENT ON TABLE public.upcoming_matches IS 'Scheduled future matches with draft support';

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: mom_votes
-- Crowd-sourced Man of the Match voting with duplicate prevention
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mom_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  voter_label TEXT,
  ip_hash TEXT,
  visitor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mom_votes_match_id ON public.mom_votes(match_id);
CREATE INDEX IF NOT EXISTS idx_mom_votes_player_id ON public.mom_votes(player_id);

-- Duplicate prevention (visitor ID 우선, 없으면 IP fallback)
CREATE UNIQUE INDEX IF NOT EXISTS mom_votes_unique_visitor
  ON public.mom_votes(match_id, visitor_id)
  WHERE visitor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mom_votes_unique_ip_fallback
  ON public.mom_votes(match_id, ip_hash)
  WHERE visitor_id IS NULL AND ip_hash IS NOT NULL;

-- ============================================================================================================
-- SECTION 5: ACCOUNTING TABLES
-- ============================================================================================================

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: payments
-- Payment records for registration, dues, and match fees
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('registration', 'monthly_dues', 'annual_dues', 'match_fee', 'other_income', 'expense', 'reimbursement')),
  amount DECIMAL(10, 2) NOT NULL,
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  payment_method TEXT CHECK (payment_method IN ('venmo', 'cash', 'zelle', 'paypal', 'card', 'other')),
  match_id UUID,                                    -- Link to specific match if match_fee
  notes TEXT,
  verified_by UUID,                                 -- Admin who verified payment
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_player_id ON public.payments(player_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON public.payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_match_id ON public.payments(match_id);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at 
  BEFORE UPDATE ON public.payments
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='payments' AND policyname='payments_select_all'
  ) THEN
    CREATE POLICY payments_select_all ON public.payments 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='payments' AND policyname='payments_ins_auth'
  ) THEN
    CREATE POLICY payments_ins_auth ON public.payments 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='payments' AND policyname='payments_upd_auth'
  ) THEN
    CREATE POLICY payments_upd_auth ON public.payments 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='payments' AND policyname='payments_del_auth'
  ) THEN
    CREATE POLICY payments_del_auth ON public.payments 
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: dues_settings
-- Configuration for registration fees and dues
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dues_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_type TEXT NOT NULL UNIQUE CHECK (setting_type IN ('registration_fee', 'monthly_dues', 'annual_dues')),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  effective_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_dues_settings_updated_at ON public.dues_settings;
CREATE TRIGGER trg_dues_settings_updated_at 
  BEFORE UPDATE ON public.dues_settings
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dues_settings ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='dues_settings' AND policyname='dues_select_all'
  ) THEN
    CREATE POLICY dues_select_all ON public.dues_settings 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='dues_settings' AND policyname='dues_ins_auth'
  ) THEN
    CREATE POLICY dues_ins_auth ON public.dues_settings 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='dues_settings' AND policyname='dues_upd_auth'
  ) THEN
    CREATE POLICY dues_upd_auth ON public.dues_settings 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: match_payments
-- Per-match payment tracking for individual players
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  expected_amount DECIMAL(10, 2) NOT NULL,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial', 'waived', 'overdue')),
  payment_date TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_payments_match_id ON public.match_payments(match_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_player_id ON public.match_payments(player_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_status ON public.match_payments(payment_status);

DROP TRIGGER IF EXISTS trg_match_payments_updated_at ON public.match_payments;
CREATE TRIGGER trg_match_payments_updated_at 
  BEFORE UPDATE ON public.match_payments
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.match_payments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_select_all'
  ) THEN
    CREATE POLICY match_payments_select_all ON public.match_payments 
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_ins_auth'
  ) THEN
    CREATE POLICY match_payments_ins_auth ON public.match_payments 
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_upd_auth'
  ) THEN
    CREATE POLICY match_payments_upd_auth ON public.match_payments 
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_del_auth'
  ) THEN
    CREATE POLICY match_payments_del_auth ON public.match_payments 
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================================================================
-- SECTION 6: GAMIFICATION & LEADERBOARD SUPPORT
-- ============================================================================================================

-- ------------------------------------------------------------------------------------------------------------
-- TABLE GROUP: badge_definitions / player_badges / player_badge_progress
-- Powers the player challenge badge system + enriched view
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.badge_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  tier SMALLINT DEFAULT 1,
  icon TEXT DEFAULT '🏅',
  color_primary TEXT DEFAULT '#10b981',
  color_secondary TEXT DEFAULT '#34d399',
  has_numeric_value BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.player_badges (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL,
  badge_id UUID NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  numeric_value INTEGER,
  match_id UUID,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.player_badge_progress (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL,
  badge_slug TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  last_match_id UUID,
  last_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, badge_slug)
);

CREATE INDEX IF NOT EXISTS idx_player_badges_player ON public.player_badges(player_id);
CREATE INDEX IF NOT EXISTS idx_player_badges_badge ON public.player_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_badge_progress_player ON public.player_badge_progress(player_id);

ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_badge_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='badge_definitions' AND policyname='Public read badge defs'
  ) THEN
    CREATE POLICY "Public read badge defs"
    ON public.badge_definitions
    FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='badge_definitions' AND policyname='Service manage badge defs'
  ) THEN
    CREATE POLICY "Service manage badge defs"
    ON public.badge_definitions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='player_badges' AND policyname='Public read player badges'
  ) THEN
    CREATE POLICY "Public read player badges"
    ON public.player_badges
    FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='player_badges' AND policyname='Service manage player badges'
  ) THEN
    CREATE POLICY "Service manage player badges"
    ON public.player_badges
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='player_badge_progress' AND policyname='Public read badge progress'
  ) THEN
    CREATE POLICY "Public read badge progress"
    ON public.player_badge_progress
    FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='player_badge_progress' AND policyname='Service manage badge progress'
  ) THEN
    CREATE POLICY "Service manage badge progress"
    ON public.player_badge_progress
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE VIEW public.player_badges_enriched AS
SELECT
  pb.id,
  pb.player_id,
  pb.badge_id,
  pb.numeric_value,
  pb.match_id,
  pb.awarded_at,
  pb.metadata,
  bd.slug,
  bd.name,
  bd.description,
  bd.category,
  bd.tier,
  bd.icon,
  bd.color_primary,
  bd.color_secondary,
  bd.has_numeric_value
FROM public.player_badges pb
JOIN public.badge_definitions bd ON bd.id = pb.badge_id;

COMMENT ON TABLE public.badge_definitions IS 'Challenge badge catalog (slug, tier, colors)';
COMMENT ON TABLE public.player_badges IS 'Awarded badges per player/match (history)';
COMMENT ON TABLE public.player_badge_progress IS 'Running progress counters for incremental badges';
COMMENT ON VIEW public.player_badges_enriched IS 'Convenience view joining badges with definitions';

-- ------------------------------------------------------------------------------------------------------------
-- TABLE: runner_scores (maintenance mini-game leaderboard)
-- ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.runner_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runner_scores_score ON public.runner_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_runner_scores_user ON public.runner_scores(user_id);

ALTER TABLE public.runner_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='runner_scores' AND policyname='Runner scores public read'
  ) THEN
    CREATE POLICY "Runner scores public read"
    ON public.runner_scores
    FOR SELECT
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='runner_scores' AND policyname='Runner scores public insert'
  ) THEN
    CREATE POLICY "Runner scores public insert"
    ON public.runner_scores
    FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.runner_scores IS 'Stores high scores from the maintenance page runner mini-game';

-- ============================================================================================================
-- SECTION 7: STORAGE BUCKET SETUP
-- ============================================================================================================
-- Creates the 'player-photos' bucket with public read access and authenticated write policies
-- Safe to run multiple times (idempotent)

-- Create bucket if missing (public so images can be viewed without signed URLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'player-photos'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'player-photos',
      'player-photos',
      true,
      5242880, -- 5MB
      ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    );
    RAISE NOTICE '✅ Created storage bucket: player-photos';
  ELSE
    RAISE NOTICE 'ℹ️  Storage bucket player-photos already exists';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'ℹ️ storage schema not initialized yet – create a bucket once Storage is enabled in Dashboard';
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ℹ️ Skipped creating bucket player-photos (requires storage schema owner); create it via Dashboard > Storage';
END $$;

-- Enable RLS on storage.objects if not already enabled (ignore if lacking ownership)
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE '✅ Enabled RLS on storage.objects';
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'ℹ️ storage.objects does not exist yet – create a bucket in Dashboard first';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'ℹ️ Skipped enabling RLS on storage.objects (requires storage schema owner)';
  END;
END $$;

-- Storage policies for player-photos bucket
DO $$
BEGIN
  BEGIN
    -- Public read for this bucket (both anon and authenticated)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read player-photos'
    ) THEN
      CREATE POLICY "Public read player-photos"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'player-photos');
      RAISE NOTICE '✅ Created policy: Public read player-photos';
    END IF;

    -- Authenticated users can upload new files under the players directory
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload player-photos by authenticated'
    ) THEN
      CREATE POLICY "Upload player-photos by authenticated"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'player-photos'
        AND (name LIKE 'players/%')
      );
      RAISE NOTICE '✅ Created policy: Upload player-photos by authenticated';
    END IF;

    -- Authenticated users can update files in this bucket (for upsert/replace)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Update player-photos by authenticated'
    ) THEN
      CREATE POLICY "Update player-photos by authenticated"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'player-photos')
      WITH CHECK (bucket_id = 'player-photos');
      RAISE NOTICE '✅ Created policy: Update player-photos by authenticated';
    END IF;

    -- Allow delete for in-app photo removal
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Delete player-photos by authenticated'
    ) THEN
      CREATE POLICY "Delete player-photos by authenticated"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'player-photos');
      RAISE NOTICE '✅ Created policy: Delete player-photos by authenticated';
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'ℹ️ storage.objects not available yet – create Storage > player-photos bucket first';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'ℹ️ Skipped creating storage policies (requires storage schema owner). Create them via Dashboard if needed.';
  END;
END $$;

COMMENT ON TABLE storage.buckets IS 'Storage buckets for file uploads';

-- ============================================================================================================
-- SECTION 8: VERIFICATION QUERIES
-- ============================================================================================================

-- Verify all tables were created
DO $$
DECLARE
  table_count INTEGER;
  expected_tables TEXT[] := ARRAY[
    'players', 'appdb', 'visit_logs', 'settings', 'membership_settings',
    'matches', 'upcoming_matches', 'payments', 'dues_settings', 'match_payments'
  ];
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename = ANY(expected_tables);

  RAISE NOTICE '✅ Created % of % expected tables', table_count, array_length(expected_tables, 1);
  
  IF table_count < array_length(expected_tables, 1) THEN
    RAISE WARNING '⚠️  Some tables may be missing. Check pg_tables for details.';
  END IF;
END $$;

-- List all created tables
SELECT 
  tablename AS "Table Name",
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS "Size"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- List all indexes
SELECT
  schemaname AS "Schema",
  tablename AS "Table",
  indexname AS "Index Name"
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- List all RLS policies
SELECT
  schemaname AS "Schema",
  tablename AS "Table",
  policyname AS "Policy Name",
  cmd AS "Command"
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verify storage bucket
DO $$
DECLARE
  bucket_exists BOOLEAN;
BEGIN
  BEGIN
    SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'player-photos') INTO bucket_exists;
    
    IF bucket_exists THEN
      RAISE NOTICE '✅ Storage bucket "player-photos" exists and is ready';
    ELSE
      RAISE WARNING '⚠️  Storage bucket "player-photos" not found - may need manual creation in Dashboard';
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE WARNING '⚠️  Storage schema not available - create bucket manually in Supabase Dashboard > Storage';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'ℹ️ Skipped verifying player-photos bucket (requires storage schema owner)';
  END;
END $$;

-- List storage policies (if storage schema exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    RAISE NOTICE 'Storage policies for player-photos bucket:';
    PERFORM schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%player-photos%'
    ORDER BY policyname;
  END IF;
END $$;

COMMIT;

-- ============================================================================================================
-- SETUP COMPLETE! 
-- ============================================================================================================
-- Next steps:
-- 1. ✅ Verify tables: SELECT * FROM pg_tables WHERE schemaname='public';
-- 2. ✅ Verify storage bucket: SELECT * FROM storage.buckets WHERE id='player-photos';
-- 3. ✅ Update teamConfig.js with your team's ROOM_ID (e.g., 'NEWTEAM-lite-room-1')
-- 4. ✅ Update .env with your Supabase project URL and anon key
-- 5. ✅ Test the app and verify all features work
-- 
-- IMPORTANT: If you get a "relation storage.buckets does not exist" error,
-- your Supabase project may not have the storage schema initialized.
-- In that case, manually create the bucket in Supabase Dashboard > Storage.
-- ============================================================================================================
