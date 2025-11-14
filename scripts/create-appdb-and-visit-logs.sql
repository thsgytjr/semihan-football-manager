-- ============================================
-- appdb (room-scoped JSON store) + visit_logs
-- Used by src/services/storage.service.js
-- ============================================

-- appdb: stores room-scoped JSON blob (upcomingMatches, tagPresets, membershipSettings, etc.)
CREATE TABLE IF NOT EXISTS public.appdb (
  id TEXT PRIMARY KEY,     -- room_id, e.g. 'hangang-lite-room-1'
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- visit_logs: store basic visit analytics
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_appdb_id ON public.appdb(id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_room_id ON public.visit_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_visited_at ON public.visit_logs(visited_at DESC);

-- Basic RLS (adjust to your needs)
ALTER TABLE public.appdb ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- appdb: allow everyone to read; authenticated can write
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_select_all'
  ) THEN
    CREATE POLICY appdb_select_all ON public.appdb FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_upsert_auth'
  ) THEN
    CREATE POLICY appdb_upsert_auth ON public.appdb FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appdb' AND policyname='appdb_update_auth'
  ) THEN
    CREATE POLICY appdb_update_auth ON public.appdb FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;

  -- visit_logs: allow insert by anyone (or authenticated only if you prefer), readable by everyone
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_logs' AND policyname='visit_logs_select_all'
  ) THEN
    CREATE POLICY visit_logs_select_all ON public.visit_logs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='visit_logs' AND policyname='visit_logs_insert_all'
  ) THEN
    CREATE POLICY visit_logs_insert_all ON public.visit_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;
