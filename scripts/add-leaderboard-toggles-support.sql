-- ============================================================
-- Add Per-Leaderboard Category Visibility Toggles
-- ============================================================
-- 
-- Purpose: 
--   Document the extension of settings to support granular
--   visibility toggles for individual leaderboard categories.
--
-- Background:
--   The settings table already uses JSONB for flexible schema.
--   This script documents the nested structure for per-category
--   leaderboard toggles while preserving all underlying data.
--
-- Settings Schema Extension:
--   Key: 'app_config'
--   Value JSONB structure (extended):
--   {
--     "appTitle": "...",
--     "seasonRecapEnabled": true/false,
--     "features": {
--       "players": true/false,
--       "planner": true/false,
--       "draft": true/false,
--       "formation": true/false,
--       "stats": true/false,
--       "mom": true/false,
--       "accounting": true/false,
--       "analytics": true/false,
--       "leaderboards": {              -- ✅ NEW nested toggles
--         "pts": true/false,           -- Attack Points (종합)
--         "g": true/false,             -- Goals (득점)
--         "a": true/false,             -- Assists (어시스트)
--         "gp": true/false,            -- Games Played (출전)
--         "cs": true/false,            -- Clean Sheets (클린시트)
--         "duo": true/false,           -- Duo (듀오)
--         "cards": true/false          -- Cards Y/R (카드)
--       }
--     }
--   }
--
-- Behavior:
--   - All toggles default to `true` (visible)
--   - Disabling a category hides UI only (data preserved)
--   - Re-enabling shows historical data immediately
--
-- Date: 2025-11-17
-- ============================================================

-- ✅ No ALTER TABLE needed - settings uses JSONB value column

-- Validation: Check current app_config structure
SELECT 
  key,
  jsonb_pretty(value) as config
FROM public.settings
WHERE key = 'app_config';

-- Example: Initialize leaderboards toggles (if not present)
INSERT INTO public.settings (key, value)
VALUES (
  'app_config',
  '{
    "appTitle": "Goalify",
    "seasonRecapEnabled": true,
    "features": {
      "players": true,
      "planner": true,
      "draft": true,
      "formation": true,
      "stats": true,
      "mom": true,
      "accounting": true,
      "analytics": true,
      "leaderboards": {
        "pts": true,
        "g": true,
        "a": true,
        "gp": true,
        "cs": true,
        "duo": true,
        "cards": true
      }
    }
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = CASE
  WHEN settings.value->'features'->'leaderboards' IS NULL THEN
    jsonb_set(
      settings.value,
      '{features,leaderboards}',
      '{
        "pts": true,
        "g": true,
        "a": true,
        "gp": true,
        "cs": true,
        "duo": true,
        "cards": true
      }'::jsonb,
      true
    )
  ELSE
    settings.value
  END,
  updated_at = NOW();

-- Validation: Check leaderboards toggles
SELECT 
  key,
  value->'features'->'leaderboards' as leaderboard_toggles
FROM public.settings
WHERE key = 'app_config';

-- Example: Update a specific toggle
UPDATE public.settings
SET 
  value = jsonb_set(
    value,
    '{features,leaderboards,cards}',
    'false'::jsonb
  ),
  updated_at = NOW()
WHERE key = 'app_config';

COMMENT ON COLUMN public.settings.value IS 
'JSONB storing app configuration. Supports nested structures including features.leaderboards for per-category visibility toggles.';
