-- ============================================
-- One-shot summary verification (single row JSON + counts)
-- Checks columns, types, indexes; reports key constraint presence
-- Safe if upcoming_matches does not exist.
-- ============================================
WITH
-- Canonical expected columns/types
expected AS (
  -- players
  SELECT 'players'::text AS t, 'id' col, 'uuid' dtype, 'NO' is_nullable UNION ALL
  SELECT 'players','name','text','NO' UNION ALL
  SELECT 'players','position','text','YES' UNION ALL
  SELECT 'players','positions','jsonb','YES' UNION ALL
  SELECT 'players','membership','text','YES' UNION ALL
  SELECT 'players','origin','text','YES' UNION ALL
  SELECT 'players','status','text','YES' UNION ALL
  SELECT 'players','tags','jsonb','YES' UNION ALL
  SELECT 'players','photo_url','text','YES' UNION ALL
  SELECT 'players','stats','jsonb','YES' UNION ALL
  SELECT 'players','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'players','updated_at','timestamp with time zone','YES' UNION ALL

  -- appdb
  SELECT 'appdb','id','text','NO' UNION ALL
  SELECT 'appdb','data','jsonb','NO' UNION ALL
  SELECT 'appdb','updated_at','timestamp with time zone','YES' UNION ALL

  -- visit_logs
  SELECT 'visit_logs','id','bigint','NO' UNION ALL
  SELECT 'visit_logs','visitor_id','text','YES' UNION ALL
  SELECT 'visit_logs','room_id','text','YES' UNION ALL
  SELECT 'visit_logs','ip_address','text','YES' UNION ALL
  SELECT 'visit_logs','user_agent','text','YES' UNION ALL
  SELECT 'visit_logs','device_type','text','YES' UNION ALL
  SELECT 'visit_logs','browser','text','YES' UNION ALL
  SELECT 'visit_logs','os','text','YES' UNION ALL
  SELECT 'visit_logs','phone_model','text','YES' UNION ALL
  SELECT 'visit_logs','visited_at','timestamp with time zone','YES' UNION ALL

  -- settings
  SELECT 'settings','id','bigint','NO' UNION ALL
  SELECT 'settings','key','text','NO' UNION ALL
  SELECT 'settings','value','jsonb','NO' UNION ALL
  SELECT 'settings','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'settings','updated_at','timestamp with time zone','YES' UNION ALL

  -- membership_settings
  SELECT 'membership_settings','id','uuid','NO' UNION ALL
  SELECT 'membership_settings','name','text','NO' UNION ALL
  SELECT 'membership_settings','badge','text','YES' UNION ALL
  SELECT 'membership_settings','badge_color','text','YES' UNION ALL
  SELECT 'membership_settings','deletable','boolean','YES' UNION ALL
  SELECT 'membership_settings','sort_order','integer','YES' UNION ALL
  SELECT 'membership_settings','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'membership_settings','updated_at','timestamp with time zone','YES' UNION ALL

  -- payments
  SELECT 'payments','id','uuid','NO' UNION ALL
  SELECT 'payments','player_id','uuid','NO' UNION ALL
  SELECT 'payments','payment_type','text','NO' UNION ALL
  SELECT 'payments','amount','numeric','NO' UNION ALL
  SELECT 'payments','payment_date','timestamp with time zone','YES' UNION ALL
  SELECT 'payments','payment_method','text','YES' UNION ALL
  SELECT 'payments','match_id','uuid','YES' UNION ALL
  SELECT 'payments','notes','text','YES' UNION ALL
  SELECT 'payments','verified_by','uuid','YES' UNION ALL
  SELECT 'payments','verified_at','timestamp with time zone','YES' UNION ALL
  SELECT 'payments','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'payments','updated_at','timestamp with time zone','YES' UNION ALL

  -- dues_settings
  SELECT 'dues_settings','id','uuid','NO' UNION ALL
  SELECT 'dues_settings','setting_type','text','NO' UNION ALL
  SELECT 'dues_settings','amount','numeric','NO' UNION ALL
  SELECT 'dues_settings','description','text','YES' UNION ALL
  SELECT 'dues_settings','effective_date','date','NO' UNION ALL
  SELECT 'dues_settings','is_active','boolean','YES' UNION ALL
  SELECT 'dues_settings','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'dues_settings','updated_at','timestamp with time zone','YES' UNION ALL

  -- match_payments
  SELECT 'match_payments','id','uuid','NO' UNION ALL
  SELECT 'match_payments','match_id','uuid','NO' UNION ALL
  SELECT 'match_payments','player_id','uuid','NO' UNION ALL
  SELECT 'match_payments','expected_amount','numeric','NO' UNION ALL
  SELECT 'match_payments','paid_amount','numeric','YES' UNION ALL
  SELECT 'match_payments','payment_status','text','NO' UNION ALL
  SELECT 'match_payments','payment_date','timestamp with time zone','YES' UNION ALL
  SELECT 'match_payments','deadline','timestamp with time zone','YES' UNION ALL
  SELECT 'match_payments','notes','text','YES' UNION ALL
  SELECT 'match_payments','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'match_payments','updated_at','timestamp with time zone','YES' UNION ALL

  -- matches
  SELECT 'matches','id','uuid','NO' UNION ALL
  SELECT 'matches','user_id','uuid','YES' UNION ALL
  SELECT 'matches','room_id','text','YES' UNION ALL
  SELECT 'matches','dateISO','timestamp with time zone','YES' UNION ALL
  SELECT 'matches','attendeeIds','jsonb','YES' UNION ALL
  SELECT 'matches','criterion','text','YES' UNION ALL
  SELECT 'matches','teamCount','integer','YES' UNION ALL
  SELECT 'matches','location','jsonb','YES' UNION ALL
  SELECT 'matches','mode','text','YES' UNION ALL
  SELECT 'matches','board','jsonb','YES' UNION ALL
  SELECT 'matches','formations','jsonb','YES' UNION ALL
  SELECT 'matches','selectionMode','text','YES' UNION ALL
  SELECT 'matches','locked','boolean','YES' UNION ALL
  SELECT 'matches','videos','jsonb','YES' UNION ALL
  SELECT 'matches','snapshot','jsonb','YES' UNION ALL
  SELECT 'matches','teamids','jsonb','YES' UNION ALL
  SELECT 'matches','stats','jsonb','YES' UNION ALL
  SELECT 'matches','draft','jsonb','YES' UNION ALL
  SELECT 'matches','quarterScores','jsonb','YES' UNION ALL
  SELECT 'matches','teamColors','jsonb','YES' UNION ALL
  SELECT 'matches','fees','jsonb','YES' UNION ALL
  SELECT 'matches','multiField','boolean','YES' UNION ALL
  SELECT 'matches','gameMatchups','jsonb','YES' UNION ALL
  SELECT 'matches','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'matches','updated_at','timestamp with time zone','YES' UNION ALL

  -- upcoming_matches (optional)
  SELECT 'upcoming_matches','id','uuid','NO' UNION ALL
  SELECT 'upcoming_matches','user_id','uuid','YES' UNION ALL
  SELECT 'upcoming_matches','room_id','text','YES' UNION ALL
  SELECT 'upcoming_matches','dateISO','timestamp with time zone','YES' UNION ALL
  SELECT 'upcoming_matches','attendeeIds','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','criterion','text','YES' UNION ALL
  SELECT 'upcoming_matches','teamCount','integer','YES' UNION ALL
  SELECT 'upcoming_matches','location','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','mode','text','YES' UNION ALL
  SELECT 'upcoming_matches','board','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','formations','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','selectionMode','text','YES' UNION ALL
  SELECT 'upcoming_matches','locked','boolean','YES' UNION ALL
  SELECT 'upcoming_matches','videos','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','teamids','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','stats','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','draft','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','teamColors','jsonb','YES' UNION ALL
  SELECT 'upcoming_matches','created_at','timestamp with time zone','YES' UNION ALL
  SELECT 'upcoming_matches','updated_at','timestamp with time zone','YES'
),
missing_cols AS (
  SELECT e.t AS table, e.col AS column
  FROM expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=e.t AND c.column_name=e.col
  WHERE c.column_name IS NULL
    AND (e.t <> 'upcoming_matches' OR EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='upcoming_matches'
    ))
),
type_mismatch AS (
  SELECT e.t AS table, e.col AS column, e.dtype AS expected_type, c.data_type AS actual_type
  FROM expected e
  JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=e.t AND c.column_name=e.col
  WHERE lower(c.data_type) <> lower(e.dtype)
    AND (e.t <> 'upcoming_matches' OR EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='upcoming_matches'
    ))
),
expected_idx AS (
  SELECT 'matches'::text AS t, unnest(ARRAY['idx_matches_user_id','idx_matches_room_id','idx_matches_dateISO','idx_matches_created_at']) AS idx
  UNION ALL
  SELECT 'upcoming_matches', unnest(ARRAY['idx_upcoming_matches_user_id','idx_upcoming_matches_room_id','idx_upcoming_matches_dateISO'])
  UNION ALL
  SELECT 'players', unnest(ARRAY['idx_players_created_at','idx_players_status','idx_players_membership'])
  UNION ALL
  SELECT 'appdb', unnest(ARRAY['idx_appdb_id'])
  UNION ALL
  SELECT 'visit_logs', unnest(ARRAY['idx_visit_logs_room_id','idx_visit_logs_visited_at'])
  UNION ALL
  SELECT 'settings', unnest(ARRAY['idx_settings_key'])
  UNION ALL
  SELECT 'membership_settings', unnest(ARRAY['idx_membership_settings_name','idx_membership_settings_sort_order'])
  UNION ALL
  SELECT 'payments', unnest(ARRAY['idx_payments_player_id','idx_payments_payment_type','idx_payments_payment_date','idx_payments_match_id'])
  UNION ALL
  SELECT 'match_payments', unnest(ARRAY['idx_match_payments_match_id','idx_match_payments_player_id','idx_match_payments_status'])
),
missing_idx AS (
  SELECT ei.t AS table, ei.idx AS index_name
  FROM expected_idx ei
  LEFT JOIN pg_indexes pi
    ON pi.schemaname='public' AND pi.tablename=ei.t AND lower(pi.indexname)=lower(ei.idx)
  WHERE pi.indexname IS NULL
    AND (ei.t <> 'upcoming_matches' OR EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='upcoming_matches'
    ))
),
-- Constraint presence checks (booleans)
settings_key_unique AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='settings' AND con.contype='u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum)
           FROM unnest(con.conkey) AS u(attnum)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.attnum)
      = ARRAY['key']::text[]
  ) AS ok
),
membership_name_unique AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='membership_settings' AND con.contype='u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum)
           FROM unnest(con.conkey) AS u(attnum)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.attnum)
      = ARRAY['name']::text[]
  ) AS ok
),
match_payments_unique AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='match_payments' AND con.contype='u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum)
           FROM unnest(con.conkey) AS u(attnum)
           JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.attnum)
      = ARRAY['match_id','player_id']::text[]
  ) AS ok
),
payments_fk_player AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_class cref ON cref.oid=con.confrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_namespace n2 ON n2.oid=cref.relnamespace
    WHERE n.nspname='public' AND c.relname='payments' AND con.contype='f'
      AND n2.nspname='public' AND cref.relname='players'
  ) AS ok
),
match_payments_fk_player AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_class cref ON cref.oid=con.confrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_namespace n2 ON n2.oid=cref.relnamespace
    WHERE n.nspname='public' AND c.relname='match_payments' AND con.contype='f'
      AND n2.nspname='public' AND cref.relname='players'
  ) AS ok
)
SELECT
  (SELECT COUNT(*) FROM missing_cols) AS missing_columns_count,
  (SELECT json_agg(m) FROM missing_cols m) AS missing_columns,
  (SELECT COUNT(*) FROM type_mismatch) AS type_mismatches_count,
  (SELECT json_agg(t) FROM type_mismatch t) AS type_mismatches,
  (SELECT COUNT(*) FROM missing_idx) AS missing_indexes_count,
  (SELECT json_agg(i) FROM missing_idx i) AS missing_indexes,
  (SELECT ok FROM settings_key_unique) AS settings_key_unique_exists,
  (SELECT ok FROM membership_name_unique) AS membership_name_unique_exists,
  (SELECT ok FROM match_payments_unique) AS match_payments_unique_exists,
  (SELECT ok FROM payments_fk_player) AS payments_fk_player_exists,
  (SELECT ok FROM match_payments_fk_player) AS match_payments_fk_player_exists,
  (
    (SELECT COUNT(*) FROM missing_cols) = 0 AND
    (SELECT COUNT(*) FROM type_mismatch) = 0 AND
    (SELECT COUNT(*) FROM missing_idx) = 0 AND
    (SELECT ok FROM settings_key_unique) AND
    (SELECT ok FROM membership_name_unique) AND
    (SELECT ok FROM match_payments_unique) AND
    (SELECT ok FROM payments_fk_player) AND
    (SELECT ok FROM match_payments_fk_player)
  ) AS schema_in_sync;
