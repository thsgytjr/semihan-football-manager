-- =====================================================================
-- RLS 정책 강화: 관리자만 데이터 수정 가능
-- =====================================================================
-- 
-- 이 스크립트는 주요 테이블의 INSERT/UPDATE/DELETE를 관리자만 가능하도록 제한합니다.
-- settings 테이블의 adminEmails 배열에 있는 이메일만 수정 권한을 갖습니다.
--
-- 적용 방법:
-- 1. Supabase Dashboard > SQL Editor에서 실행
-- 2. 또는 psql로 실행: psql -h db.xxx.supabase.co -U postgres -d postgres -f this-file.sql
--
-- 주의: 실행 전 백업 권장!
-- =====================================================================

-- ---------------------------------------------------------------------
-- 헬퍼 함수: 현재 사용자가 관리자인지 확인
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_email TEXT;
  admin_emails JSONB;
BEGIN
  -- 현재 로그인한 사용자 이메일
  user_email := auth.email();
  
  -- 로그인하지 않았으면 false
  IF user_email IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- settings 테이블에서 adminEmails 가져오기
  SELECT value->'adminEmails' INTO admin_emails
  FROM public.settings
  WHERE key = 'app_settings'
  LIMIT 1;
  
  -- adminEmails 설정이 없거나 빈 배열이면, 모든 authenticated 사용자를 admin으로 간주 (백워드 호환)
  IF admin_emails IS NULL OR jsonb_array_length(admin_emails) = 0 THEN
    RETURN TRUE;
  END IF;
  
  -- adminEmails 배열에 현재 사용자 이메일이 있는지 확인 (대소문자 무시)
  RETURN EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(admin_emails) AS admin_email
    WHERE lower(admin_email) = lower(user_email)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.is_admin() IS 'settings.app_settings.adminEmails에 현재 사용자가 포함되어 있는지 확인';


-- =====================================================================
-- 1. PLAYERS 테이블
-- =====================================================================
-- 기존 정책 삭제
DROP POLICY IF EXISTS players_select_all ON public.players;
DROP POLICY IF EXISTS players_ins_auth ON public.players;
DROP POLICY IF EXISTS players_upd_auth ON public.players;
DROP POLICY IF EXISTS players_del_auth ON public.players;

-- 새 정책: 읽기는 모두, 수정은 관리자만
CREATE POLICY "Players: Public read"
  ON public.players
  FOR SELECT
  USING (true);

CREATE POLICY "Players: Admin insert"
  ON public.players
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Players: Admin update"
  ON public.players
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Players: Admin delete"
  ON public.players
  FOR DELETE
  USING (public.is_admin());


-- =====================================================================
-- 2. MATCHES 테이블
-- =====================================================================
DROP POLICY IF EXISTS matches_select_all ON public.matches;
DROP POLICY IF EXISTS matches_ins_auth ON public.matches;
DROP POLICY IF EXISTS matches_upd_auth ON public.matches;
DROP POLICY IF EXISTS matches_del_auth ON public.matches;

CREATE POLICY "Matches: Public read"
  ON public.matches
  FOR SELECT
  USING (true);

CREATE POLICY "Matches: Admin insert"
  ON public.matches
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Matches: Admin update"
  ON public.matches
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Matches: Admin delete"
  ON public.matches
  FOR DELETE
  USING (public.is_admin());


-- =====================================================================
-- 3. UPCOMING_MATCHES 테이블
-- =====================================================================
DROP POLICY IF EXISTS upcoming_matches_select_all ON public.upcoming_matches;
DROP POLICY IF EXISTS upcoming_matches_ins_auth ON public.upcoming_matches;
DROP POLICY IF EXISTS upcoming_matches_upd_auth ON public.upcoming_matches;
DROP POLICY IF EXISTS upcoming_matches_del_auth ON public.upcoming_matches;

CREATE POLICY "Upcoming matches: Public read"
  ON public.upcoming_matches
  FOR SELECT
  USING (true);

CREATE POLICY "Upcoming matches: Admin insert"
  ON public.upcoming_matches
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Upcoming matches: Admin update"
  ON public.upcoming_matches
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Upcoming matches: Admin delete"
  ON public.upcoming_matches
  FOR DELETE
  USING (public.is_admin());


-- =====================================================================
-- 4. TAG_PRESETS 테이블
-- =====================================================================
DROP POLICY IF EXISTS tag_presets_select_all ON public.tag_presets;
DROP POLICY IF EXISTS tag_presets_ins_auth ON public.tag_presets;
DROP POLICY IF EXISTS tag_presets_upd_auth ON public.tag_presets;
DROP POLICY IF EXISTS tag_presets_del_auth ON public.tag_presets;

CREATE POLICY "Tag presets: Public read"
  ON public.tag_presets
  FOR SELECT
  USING (true);

CREATE POLICY "Tag presets: Admin insert"
  ON public.tag_presets
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Tag presets: Admin update"
  ON public.tag_presets
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Tag presets: Admin delete"
  ON public.tag_presets
  FOR DELETE
  USING (public.is_admin());


-- =====================================================================
-- 5. MOM_VOTES 테이블
-- =====================================================================
DROP POLICY IF EXISTS mom_votes_select_all ON public.mom_votes;
DROP POLICY IF EXISTS mom_votes_ins_auth ON public.mom_votes;
DROP POLICY IF EXISTS mom_votes_upd_auth ON public.mom_votes;
DROP POLICY IF EXISTS mom_votes_del_auth ON public.mom_votes;

CREATE POLICY "MOM votes: Public read"
  ON public.mom_votes
  FOR SELECT
  USING (true);

CREATE POLICY "MOM votes: Admin insert"
  ON public.mom_votes
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "MOM votes: Admin update"
  ON public.mom_votes
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "MOM votes: Admin delete"
  ON public.mom_votes
  FOR DELETE
  USING (public.is_admin());


-- =====================================================================
-- 6. SETTINGS 테이블 (가장 중요!)
-- =====================================================================
DROP POLICY IF EXISTS "Allow public read access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public update access to settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public insert access to settings" ON public.settings;

CREATE POLICY "Settings: Public read"
  ON public.settings
  FOR SELECT
  USING (true);

CREATE POLICY "Settings: Admin insert"
  ON public.settings
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Settings: Admin update"
  ON public.settings
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Settings: Admin delete"
  ON public.settings
  FOR DELETE
  USING (public.is_admin());


-- =====================================================================
-- 7. ACCOUNTING_TRANSACTIONS 테이블 (민감 데이터)
-- =====================================================================
DROP POLICY IF EXISTS accounting_transactions_select_all ON public.accounting_transactions;
DROP POLICY IF EXISTS accounting_transactions_ins_auth ON public.accounting_transactions;
DROP POLICY IF EXISTS accounting_transactions_upd_auth ON public.accounting_transactions;
DROP POLICY IF EXISTS accounting_transactions_del_auth ON public.accounting_transactions;

-- 읽기도 관리자만
CREATE POLICY "Accounting: Admin only"
  ON public.accounting_transactions
  FOR ALL
  USING (public.is_admin());


-- =====================================================================
-- 8. MEMBERSHIP_SETTINGS 테이블
-- =====================================================================
DROP POLICY IF EXISTS membership_settings_public_read ON public.membership_settings;
DROP POLICY IF EXISTS membership_settings_auth_write ON public.membership_settings;

CREATE POLICY "Membership settings: Public read"
  ON public.membership_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Membership settings: Admin write"
  ON public.membership_settings
  FOR ALL
  USING (public.is_admin());


-- =====================================================================
-- 9. VISIT_LOGS 테이블 (방문자 분석)
-- =====================================================================
DROP POLICY IF EXISTS visit_logs_select_all ON public.visit_logs;
DROP POLICY IF EXISTS visit_logs_insert_all ON public.visit_logs;

-- 읽기는 관리자만
CREATE POLICY "Visit logs: Admin read"
  ON public.visit_logs
  FOR SELECT
  USING (public.is_admin());

-- 쓰기는 모두 허용 (방문 기록용)
CREATE POLICY "Visit logs: Public insert"
  ON public.visit_logs
  FOR INSERT
  WITH CHECK (true);


-- =====================================================================
-- 완료 메시지
-- =====================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ RLS 정책 강화 완료!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 적용된 정책:';
  RAISE NOTICE '   - Players, Matches, Upcoming matches: 읽기는 모두, 수정은 관리자만';
  RAISE NOTICE '   - Tag presets, MOM votes: 읽기는 모두, 수정은 관리자만';
  RAISE NOTICE '   - Settings, Membership settings: 읽기는 모두, 수정은 관리자만';
  RAISE NOTICE '   - Accounting: 읽기/쓰기 모두 관리자만';
  RAISE NOTICE '   - Visit logs: 읽기는 관리자만, 쓰기는 모두';
  RAISE NOTICE '';
  RAISE NOTICE '⚙️  관리자 설정 방법:';
  RAISE NOTICE '   1. 앱 설정 페이지에서 adminEmails에 이메일 추가';
  RAISE NOTICE '   2. 또는 SQL로 직접 추가:';
  RAISE NOTICE '      UPDATE settings SET value = jsonb_set(value, ''{adminEmails}'', ''["admin@example.com"]''::jsonb) WHERE key = ''app_settings'';';
  RAISE NOTICE '';
  RAISE NOTICE '🧪 테스트 방법:';
  RAISE NOTICE '   1. 관리자가 아닌 계정으로 로그인';
  RAISE NOTICE '   2. 브라우저 콘솔에서 실행: await supabase.from("players").insert({name: "Test"})';
  RAISE NOTICE '   3. 에러 발생 확인: "new row violates row-level security policy"';
END $$;
