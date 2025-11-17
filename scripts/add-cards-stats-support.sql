-- ============================================================
-- Add Yellow/Red Cards Support to Stats
-- ============================================================
-- 
-- Purpose: 
--   Document the extension of the stats JSONB field to support
--   yellow and red card tracking per player.
--
-- Background:
--   The matches.stats column is already JSONB and flexible enough
--   to store card data without schema changes. This script serves
--   as documentation and includes helpful queries for validation.
--
-- Schema:
--   matches.stats is JSONB with structure:
--   {
--     "<playerId>": {
--       "goals": number,
--       "assists": number,
--       "events": array,
--       "cleanSheet": number,
--       "yellowCards": number,   -- ✅ NEW
--       "redCards": number        -- ✅ NEW
--     }
--   }
--
-- Date: 2025-11-17
-- ============================================================

-- ✅ No ALTER TABLE needed - stats is already JSONB

-- Validation: Check if any matches have card data
SELECT 
  id,
  "dateISO",
  jsonb_pretty(stats) as stats_preview
FROM public.matches
WHERE 
  stats::text LIKE '%yellowCards%' 
  OR stats::text LIKE '%redCards%'
LIMIT 5;

-- Example query: Get card totals per player across all matches
SELECT 
  player_id,
  SUM((stats_entry.value->>'yellowCards')::int) as total_yellow_cards,
  SUM((stats_entry.value->>'redCards')::int) as total_red_cards
FROM 
  public.matches,
  jsonb_each(stats) as stats_entry(player_id, value)
WHERE 
  stats_entry.value ? 'yellowCards' 
  OR stats_entry.value ? 'redCards'
GROUP BY player_id
ORDER BY total_red_cards DESC, total_yellow_cards DESC;

-- Validation: Check stats structure consistency
SELECT 
  COUNT(*) as total_matches,
  COUNT(*) FILTER (WHERE stats IS NOT NULL) as matches_with_stats,
  COUNT(*) FILTER (WHERE stats::text LIKE '%yellowCards%') as matches_with_yellow_cards,
  COUNT(*) FILTER (WHERE stats::text LIKE '%redCards%') as matches_with_red_cards
FROM public.matches;

COMMENT ON COLUMN public.matches.stats IS 
'JSONB storing player stats per match. Schema per player: { goals, assists, events[], cleanSheet, yellowCards, redCards }';
