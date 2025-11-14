-- ============================================
-- Players table (unified)
-- Used by src/services/storage.service.js
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Legacy single position field (kept for compatibility)
  position TEXT,
  -- New multi-positions as JSON array of strings, e.g., ["GK","DF"]
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

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_players_created_at ON public.players(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_status ON public.players(status);
CREATE INDEX IF NOT EXISTS idx_players_membership ON public.players(membership);

-- RLS (basic; adjust if needed)
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_select_all'
  ) THEN
    CREATE POLICY players_select_all ON public.players FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_ins_auth'
  ) THEN
    CREATE POLICY players_ins_auth ON public.players FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_upd_auth'
  ) THEN
    CREATE POLICY players_upd_auth ON public.players FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='players' AND policyname='players_del_auth'
  ) THEN
    CREATE POLICY players_del_auth ON public.players FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_players_updated_at ON public.players;
CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
