-- ============================================
-- Basic verification of unified schema (matches / upcoming_matches)
-- Run after applying semihan-schema-fix.sql or dksc-schema-fix.sql
-- This script is safe even if upcoming_matches table does not exist.
-- ============================================

-- 1) Column metadata
SELECT 'matches' AS table, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='matches'
ORDER BY column_name;

-- upcoming_matches column metadata (safe: information_schema only)
SELECT 'upcoming_matches' AS table, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='upcoming_matches'
ORDER BY column_name;

-- 2) Expected column diff (should return 0 rows if aligned)
WITH expected AS (
	SELECT 'matches'::text AS t, unnest(ARRAY[
		'user_id','room_id','dateISO','attendeeIds','criterion','teamCount','location','mode',
		'board','formations','selectionMode','locked','videos','teamids','stats','draft',
		'teamColors','created_at','updated_at'
	]) AS col
	UNION ALL
	SELECT 'upcoming_matches', unnest(ARRAY[
		'user_id','room_id','dateISO','attendeeIds','criterion','teamCount','location','mode',
		'board','formations','selectionMode','locked','videos','teamids','stats','draft',
		'teamColors','created_at','updated_at'
	])
)
SELECT e.t AS table, e.col AS expected_missing_column
FROM expected e
LEFT JOIN information_schema.columns c
	ON c.table_schema='public' AND c.table_name=e.t AND c.column_name=e.col
WHERE c.column_name IS NULL
	AND (
		e.t <> 'upcoming_matches' OR EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema='public' AND table_name='upcoming_matches'
		)
	)
ORDER BY 1,2;

-- 3) Index presence
SELECT 'matches' AS table, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='matches'
ORDER BY indexname;

SELECT 'upcoming_matches' AS table, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='upcoming_matches'
ORDER BY indexname;

-- 4) Index diff (should return 0 rows if aligned)
WITH expected_indexes AS (
	SELECT 'matches'::text AS t, unnest(ARRAY[
		'idx_matches_user_id','idx_matches_room_id','idx_matches_dateISO','idx_matches_created_at'
	]) AS idx
	UNION ALL
	SELECT 'upcoming_matches', unnest(ARRAY[
		'idx_upcoming_matches_user_id','idx_upcoming_matches_room_id','idx_upcoming_matches_dateISO'
	])
)
SELECT ei.t AS table, ei.idx AS expected_missing_index
FROM expected_indexes ei
LEFT JOIN pg_indexes pi
	ON pi.schemaname='public' AND pi.tablename=ei.t AND lower(pi.indexname)=lower(ei.idx)
WHERE pi.indexname IS NULL
	AND (
		ei.t <> 'upcoming_matches' OR EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema='public' AND table_name='upcoming_matches'
		)
	)
ORDER BY 1,2;