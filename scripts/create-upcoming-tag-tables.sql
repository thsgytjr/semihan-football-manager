-- Migration: AppDB → Normalized Tables
-- Creates: upcoming_matches, tag_presets tables
-- Date: 2025-11-15
-- Purpose: Complete AppDB retirement

-- ============================================
-- 1. upcoming_matches Table
-- ============================================
CREATE TABLE IF NOT EXISTS upcoming_matches (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL,
  location JSONB DEFAULT '{}',
  snapshot JSONB DEFAULT '[]',
  captain_ids JSONB DEFAULT '[]',
  formations JSONB DEFAULT '[]',
  team_count INTEGER DEFAULT 2,
  is_draft_mode BOOLEAN DEFAULT false,
  is_draft_complete BOOLEAN DEFAULT false,
  draft_completed_at TIMESTAMPTZ,
  total_cost NUMERIC(10,2) DEFAULT 0,
  fees_disabled BOOLEAN DEFAULT false,
  team_colors JSONB DEFAULT '[]',
  criterion TEXT DEFAULT 'overall',
  status TEXT DEFAULT 'pending',
  participant_ids JSONB DEFAULT '[]',
  attendee_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_date ON upcoming_matches(date_iso);
CREATE INDEX IF NOT EXISTS idx_upcoming_matches_status ON upcoming_matches(status);

-- RLS Policies for upcoming_matches
ALTER TABLE upcoming_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upcoming_matches_select" ON upcoming_matches;
CREATE POLICY "upcoming_matches_select" ON upcoming_matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "upcoming_matches_insert" ON upcoming_matches FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "upcoming_matches_update" ON upcoming_matches FOR UPDATE USING (true);

DROP POLICY IF EXISTS "upcoming_matches_delete" ON upcoming_matches FOR DELETE USING (true);

-- ============================================
-- 2. tag_presets Table
-- ============================================
CREATE TABLE IF NOT EXISTS tag_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name)
);

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_tag_presets_order ON tag_presets(sort_order);

-- RLS Policies for tag_presets
ALTER TABLE tag_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tag_presets_select" ON tag_presets;
CREATE POLICY "tag_presets_select" ON tag_presets FOR SELECT USING (true);

DROP POLICY IF EXISTS "tag_presets_insert" ON tag_presets FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "tag_presets_update" ON tag_presets FOR UPDATE USING (true);

DROP POLICY IF EXISTS "tag_presets_delete" ON tag_presets FOR DELETE USING (true);

-- ============================================
-- 3. Updated at trigger functions
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
DROP TRIGGER IF EXISTS update_upcoming_matches_updated_at ON upcoming_matches;
CREATE TRIGGER update_upcoming_matches_updated_at
  BEFORE UPDATE ON upcoming_matches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tag_presets_updated_at ON tag_presets;
CREATE TRIGGER update_tag_presets_updated_at
  BEFORE UPDATE ON tag_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. Migration helper: Copy from AppDB
-- ============================================
-- 이 스크립트는 기존 appdb 데이터를 새 테이블로 복사하는 헬퍼입니다
-- 실행 전 백업 필수!

-- Example migration (주석 해제 후 팀별로 실행):
/*
-- Semihan upcoming matches migration
WITH appdb_data AS (
  SELECT 
    (data::jsonb -> 'upcomingMatches') as upcoming_matches_json
  FROM appdb 
  WHERE id = 'semihan-lite-room-1'
),
parsed_matches AS (
  SELECT 
    jsonb_array_elements(upcoming_matches_json) as match_data
  FROM appdb_data
  WHERE upcoming_matches_json IS NOT NULL
)
INSERT INTO upcoming_matches (
  id, date_iso, location, snapshot, captain_ids, formations, 
  team_count, is_draft_mode, is_draft_complete, draft_completed_at,
  total_cost, fees_disabled, team_colors, criterion, status,
  participant_ids, attendee_ids
)
SELECT 
  match_data->>'id',
  match_data->>'dateISO',
  COALESCE(match_data->'location', '{}'::jsonb),
  COALESCE(match_data->'snapshot', '[]'::jsonb),
  COALESCE(match_data->'captainIds', '[]'::jsonb),
  COALESCE(match_data->'formations', '[]'::jsonb),
  COALESCE((match_data->>'teamCount')::integer, 2),
  COALESCE((match_data->>'isDraftMode')::boolean, false),
  COALESCE((match_data->>'isDraftComplete')::boolean, false),
  (match_data->>'draftCompletedAt')::timestamptz,
  COALESCE((match_data->>'totalCost')::numeric, 0),
  COALESCE((match_data->>'feesDisabled')::boolean, false),
  COALESCE(match_data->'teamColors', '[]'::jsonb),
  COALESCE(match_data->>'criterion', 'overall'),
  COALESCE(match_data->>'status', 'pending'),
  COALESCE(match_data->'participantIds', '[]'::jsonb),
  COALESCE(match_data->'attendeeIds', '[]'::jsonb)
FROM parsed_matches
ON CONFLICT (id) DO NOTHING;

-- Semihan tag presets migration
WITH appdb_data AS (
  SELECT 
    (data::jsonb -> 'tagPresets') as tag_presets_json
  FROM appdb 
  WHERE id = 'semihan-lite-room-1'
),
parsed_tags AS (
  SELECT 
    jsonb_array_elements(tag_presets_json) as tag_data,
    ROW_NUMBER() OVER () as row_num
  FROM appdb_data
  WHERE tag_presets_json IS NOT NULL
)
INSERT INTO tag_presets (id, name, color, sort_order)
SELECT 
  COALESCE(tag_data->>'id', gen_random_uuid()::text),
  tag_data->>'name',
  COALESCE(tag_data->>'color', 'blue'),
  row_num::integer
FROM parsed_tags
ON CONFLICT (id) DO NOTHING;
*/

-- ============================================
-- 5. Verification Queries
-- ============================================
-- Check migrated data counts
-- SELECT COUNT(*) as upcoming_matches_count FROM upcoming_matches;
-- SELECT COUNT(*) as tag_presets_count FROM tag_presets;

-- Compare with AppDB
-- SELECT 
--   id,
--   jsonb_array_length(data::jsonb -> 'upcomingMatches') as appdb_upcoming_count,
--   jsonb_array_length(data::jsonb -> 'tagPresets') as appdb_tag_count
-- FROM appdb 
-- WHERE id IN ('semihan-lite-room-1', 'dksc-lite-room-1', 'hangang-lite-room-1');
