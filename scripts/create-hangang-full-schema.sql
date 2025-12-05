-- ============================================
-- Hangang Football Manager - Full Schema Setup
-- Creates all required tables with unified schema matching Semihan/DKSC
-- Safe and idempotent (IF NOT EXISTS / OR REPLACE)
-- ============================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reusable trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Core data tables: players, appdb, visit_logs
-- ------------------------------------------------
-- players
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position TEXT,
  positions JSONB DEFAULT '[]'::jsonb,
  membership TEXT,
  origin TEXT DEFAULT 'none',
  status TEXT DEFAULT 'active',
  tags JSONB DEFAULT '[]'::jsonb,
  photo_url TEXT,
  stats JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_players_created_at ON public.players(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_status ON public.players(status);
CREATE INDEX IF NOT EXISTS idx_players_membership ON public.players(membership);
DROP TRIGGER IF EXISTS trg_players_updated_at ON public.players;
CREATE TRIGGER trg_players_updated_at BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_select_all') THEN
    CREATE POLICY players_select_all ON public.players FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_ins_auth') THEN
    CREATE POLICY players_ins_auth ON public.players FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_upd_auth') THEN
    CREATE POLICY players_upd_auth ON public.players FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_del_auth') THEN
    CREATE POLICY players_del_auth ON public.players FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- appdb
CREATE TABLE IF NOT EXISTS public.appdb (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.appdb ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_select_all') THEN
    CREATE POLICY appdb_select_all ON public.appdb FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_upsert_auth') THEN
    CREATE POLICY appdb_upsert_auth ON public.appdb FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_update_auth') THEN
    CREATE POLICY appdb_update_auth ON public.appdb FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_appdb_id ON public.appdb(id);

-- visit_logs
CREATE TABLE IF NOT EXISTS public.visit_logs (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT,
  room_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  phone_model TEXT,
  visited_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_logs' AND policyname='visit_logs_select_all') THEN
    CREATE POLICY visit_logs_select_all ON public.visit_logs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_logs' AND policyname='visit_logs_insert_all') THEN
    CREATE POLICY visit_logs_insert_all ON public.visit_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_visit_logs_room_id ON public.visit_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_visited_at ON public.visit_logs(visited_at DESC);

-- 2) Settings tables
-- ------------------------------------------------
-- settings
CREATE TABLE IF NOT EXISTS public.settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settings_key ON public.settings(key);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='settings' AND policyname='settings_select_all') THEN
    CREATE POLICY settings_select_all ON public.settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='settings' AND policyname='settings_update_all') THEN
    CREATE POLICY settings_update_all ON public.settings FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='settings' AND policyname='settings_insert_all') THEN
    CREATE POLICY settings_insert_all ON public.settings FOR INSERT WITH CHECK (true);
  END IF;
END $$;
COMMENT ON TABLE public.settings IS 'Stores application-wide settings and feature flags';
COMMENT ON COLUMN public.settings.key IS 'Unique identifier for the setting';
COMMENT ON COLUMN public.settings.value IS 'JSONB value containing the setting data';

-- default setting
INSERT INTO public.settings (key, value)
VALUES (
  'app_settings',
  '{
    "appTitle": "Hangang-FM",
    "appName": "Hangang Football Manager",
    "seasonRecapEnabled": true,
    "features": { "players": true, "planner": true, "draft": true, "formation": true, "stats": true }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- membership_settings
CREATE TABLE IF NOT EXISTS public.membership_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  badge TEXT,
  badge_color TEXT DEFAULT 'stone',
  deletable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_membership_settings_name ON public.membership_settings(name);
CREATE INDEX IF NOT EXISTS idx_membership_settings_sort_order ON public.membership_settings(sort_order);
DROP TRIGGER IF EXISTS trg_membership_settings_updated_at ON public.membership_settings;
CREATE TRIGGER trg_membership_settings_updated_at BEFORE UPDATE ON public.membership_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.membership_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_select') THEN
    CREATE POLICY membership_select ON public.membership_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_insert_auth') THEN
    CREATE POLICY membership_insert_auth ON public.membership_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_update_auth') THEN
    CREATE POLICY membership_update_auth ON public.membership_settings FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='membership_settings' AND policyname='membership_delete_auth') THEN
    CREATE POLICY membership_delete_auth ON public.membership_settings FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

INSERT INTO public.membership_settings (name, badge, badge_color, deletable, sort_order)
VALUES 
  ('정회원', NULL, 'emerald', true, 1),
  ('준회원', '준', 'amber', true, 2),
  ('게스트', 'G', 'rose', true, 3)
ON CONFLICT (name) DO NOTHING;

-- 3) Accounting tables: payments, dues_settings, match_payments
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('registration', 'monthly_dues', 'annual_dues', 'match_fee', 'other_income', 'expense', 'reimbursement')),
  amount DECIMAL(10, 2) NOT NULL,
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  payment_method TEXT CHECK (payment_method IN ('venmo', 'cash', 'zelle', 'other')),
  match_id UUID,
  notes TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_payments_player_id ON public.payments(player_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON public.payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_match_id ON public.payments(match_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_match_id ON public.match_payments(match_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_player_id ON public.match_payments(player_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_status ON public.match_payments(payment_status);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_dues_settings_updated_at ON public.dues_settings;
CREATE TRIGGER trg_dues_settings_updated_at BEFORE UPDATE ON public.dues_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_match_payments_updated_at ON public.match_payments;
CREATE TRIGGER trg_match_payments_updated_at BEFORE UPDATE ON public.match_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dues_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='payments_select_all') THEN
    CREATE POLICY payments_select_all ON public.payments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='payments_ins_auth') THEN
    CREATE POLICY payments_ins_auth ON public.payments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='payments_upd_auth') THEN
    CREATE POLICY payments_upd_auth ON public.payments FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='payments_del_auth') THEN
    CREATE POLICY payments_del_auth ON public.payments FOR DELETE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dues_settings' AND policyname='dues_select_all') THEN
    CREATE POLICY dues_select_all ON public.dues_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dues_settings' AND policyname='dues_ins_auth') THEN
    CREATE POLICY dues_ins_auth ON public.dues_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dues_settings' AND policyname='dues_upd_auth') THEN
    CREATE POLICY dues_upd_auth ON public.dues_settings FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_select_all') THEN
    CREATE POLICY match_payments_select_all ON public.match_payments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_ins_auth') THEN
    CREATE POLICY match_payments_ins_auth ON public.match_payments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_upd_auth') THEN
    CREATE POLICY match_payments_upd_auth ON public.match_payments FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='match_payments' AND policyname='match_payments_del_auth') THEN
    CREATE POLICY match_payments_del_auth ON public.match_payments FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 4) Matches + Upcoming (unified schema)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON public.matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_room_id ON public.matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_dateISO ON public.matches("dateISO");
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON public.matches(created_at);
COMMENT ON COLUMN public.matches.user_id IS '개인 소유자 ID (Semihan용)';
COMMENT ON COLUMN public.matches.room_id IS '팀 공유 방 ID (DKSC/멀티테넌트 room scope)';
COMMENT ON COLUMN public.matches."dateISO" IS 'Match date and time with timezone (TIMESTAMPTZ)';
COMMENT ON COLUMN public.matches."attendeeIds" IS 'Array of attendee player IDs (통일된 컬럼명)';
COMMENT ON COLUMN public.matches."teamColors" IS 'Array of team color configurations: [{bg, text, border, label}, ...] or null';

CREATE TABLE IF NOT EXISTS public.upcoming_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

COMMIT;

-- Done. Run scripts/schema-verify-basic.sql to verify.
