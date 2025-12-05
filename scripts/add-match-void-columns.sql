-- ============================================
-- matches 테이블에 VOID 상태 컬럼 추가
-- ============================================

-- 1) 집계/미납 목록에서 제외 여부
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS "isVoided" BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) VOID 사유 (선택)
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS "voidReason" TEXT DEFAULT NULL;

-- 3) VOID 처리 시각
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMPTZ DEFAULT NULL;

-- 4) 처리한 사용자 (Supabase auth.users 참조)
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS "voidedBy" UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN matches."isVoided" IS '재정 집계/미납 목록에서 제외할 VOID 상태 여부';
COMMENT ON COLUMN matches."voidReason" IS 'VOID 처리 사유 (선택 입력)';
COMMENT ON COLUMN matches."voidedAt" IS 'VOID 처리(또는 해제)된 시각';
COMMENT ON COLUMN matches."voidedBy" IS 'VOID 처리한 사용자 ID';
