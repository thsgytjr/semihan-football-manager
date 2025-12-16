-- ============================================
-- Fix player_badges_enriched view
-- 
-- Problem: View is missing player_id column
-- Solution: Recreate view with correct columns
-- ============================================

-- Drop existing view
DROP VIEW IF EXISTS public.player_badges_enriched;

-- Recreate view with all necessary columns including player_id
CREATE OR REPLACE VIEW public.player_badges_enriched 
WITH (security_invoker=true)
AS
SELECT
  pb.id,
  pb.player_id,          -- ✅ This column was missing
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
FROM player_badges pb
JOIN badge_definitions bd ON bd.id = pb.badge_id;

COMMENT ON VIEW public.player_badges_enriched IS 'Enriched player badges with badge definitions (security_invoker=true)';

-- Verify the view structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'player_badges_enriched'
ORDER BY ordinal_position;

-- Test query
SELECT COUNT(*) as total_badges,
       COUNT(DISTINCT player_id) as unique_players,
       COUNT(DISTINCT badge_id) as unique_badge_types
FROM public.player_badges_enriched;

SELECT '✅ player_badges_enriched view recreated successfully!' as status;
