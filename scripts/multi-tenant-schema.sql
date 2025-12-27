-- =============================================================================
-- 멀티테넌트 데이터베이스 스키마
-- =============================================================================
-- 목적: 1개의 Supabase 프로젝트로 무제한 팀 지원
-- 실행: 새로운 Supabase 프로젝트에서 실행 (기존 프로젝트 영향 없음)
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. teams 테이블 (핵심)
-- =============================================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 기본 정보
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 플랜 정보
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  max_players INTEGER DEFAULT 50,
  max_storage_mb INTEGER DEFAULT 100,
  
  -- 커스터마이징
  logo_url TEXT,
  primary_color TEXT DEFAULT '#10b981',
  secondary_color TEXT DEFAULT '#3b82f6',
  
  -- 관리
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  owner_user_id UUID,
  
  -- 연락처
  contact_email TEXT,
  contact_phone TEXT,
  
  -- 통계 (캐시)
  total_players INTEGER DEFAULT 0,
  total_matches INTEGER DEFAULT 0,
  
  CONSTRAINT subdomain_format CHECK (subdomain ~ '^[a-z0-9-]+$')
);

-- 인덱스
CREATE INDEX idx_teams_subdomain ON teams(subdomain);
CREATE INDEX idx_teams_slug ON teams(slug);
CREATE INDEX idx_teams_status ON teams(status) WHERE status = 'active';
CREATE INDEX idx_teams_owner ON teams(owner_user_id);

-- 자동 updated_at 업데이트
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_teams_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 2. players 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  -- 기본 정보
  name TEXT NOT NULL,
  number INTEGER,
  position TEXT,
  
  -- 연락처
  phone TEXT,
  email TEXT,
  
  -- 상태
  status TEXT DEFAULT 'active',
  join_date DATE,
  
  -- 멤버십
  membership_status TEXT,
  membership_amount DECIMAL,
  last_payment_date DATE,
  
  -- 통계
  total_goals INTEGER DEFAULT 0,
  total_assists INTEGER DEFAULT 0,
  total_matches INTEGER DEFAULT 0,
  
  -- 메타
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 제약
  CONSTRAINT players_team_number_unique UNIQUE(team_id, number)
);

CREATE INDEX idx_players_team_id ON players(team_id);
CREATE INDEX idx_players_status ON players(team_id, status) WHERE status = 'active';
CREATE INDEX idx_players_position ON players(team_id, position);

CREATE TRIGGER update_players_updated_at
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. matches 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  -- 매치 정보
  opponent TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME,
  location TEXT,
  match_type TEXT DEFAULT 'league',
  
  -- 점수
  team_score INTEGER DEFAULT 0,
  opponent_score INTEGER DEFAULT 0,
  
  -- 쿼터 점수 (JSON)
  quarter_scores JSONB,
  
  -- 상태
  status TEXT DEFAULT 'completed',
  is_void BOOLEAN DEFAULT false,
  
  -- 통계 (JSON)
  formation TEXT,
  lineup JSONB,
  stats JSONB,
  
  -- 메타
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_matches_team_id ON matches(team_id);
CREATE INDEX idx_matches_date ON matches(team_id, date DESC);
CREATE INDEX idx_matches_status ON matches(team_id, status);

CREATE TRIGGER update_matches_updated_at
BEFORE UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 4. upcoming_matches 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE upcoming_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  opponent TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME,
  location TEXT,
  notes TEXT,
  
  -- 출석 관리
  attendance_enabled BOOLEAN DEFAULT false,
  rsvp_deadline TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_upcoming_matches_team_id ON upcoming_matches(team_id);
CREATE INDEX idx_upcoming_matches_date ON upcoming_matches(team_id, date ASC);

CREATE TRIGGER update_upcoming_matches_updated_at
BEFORE UPDATE ON upcoming_matches
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 5. settings 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE UNIQUE,
  
  team_name TEXT,
  season TEXT DEFAULT '2024/25',
  team_colors JSONB DEFAULT '{"primary": "#10b981", "secondary": "#3b82f6"}',
  
  -- 기능 설정
  features JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_settings_team_id ON settings(team_id);

CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 6. membership_settings 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE membership_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE UNIQUE,
  
  enabled BOOLEAN DEFAULT false,
  monthly_fee DECIMAL DEFAULT 0,
  payment_day INTEGER DEFAULT 1,
  
  -- 알림 설정
  notification_settings JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_membership_settings_team_id ON membership_settings(team_id);

CREATE TRIGGER update_membership_settings_updated_at
BEFORE UPDATE ON membership_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 7. mom_votes 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE mom_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  match_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  voter_name TEXT NOT NULL,
  
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT mom_votes_unique UNIQUE(team_id, match_id, voter_name)
);

CREATE INDEX idx_mom_votes_team_id ON mom_votes(team_id);
CREATE INDEX idx_mom_votes_match_id ON mom_votes(team_id, match_id);
CREATE INDEX idx_mom_votes_player_id ON mom_votes(team_id, player_id);

-- =============================================================================
-- 8. badge_system 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE badge_system (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  badge_data JSONB,
  
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT badge_unique UNIQUE(team_id, player_id, badge_type)
);

CREATE INDEX idx_badge_system_team_id ON badge_system(team_id);
CREATE INDEX idx_badge_system_player_id ON badge_system(team_id, player_id);

-- =============================================================================
-- 9. accounting_transactions 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE accounting_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  description TEXT,
  
  -- 연결
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  match_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounting_transactions_team_id ON accounting_transactions(team_id);
CREATE INDEX idx_accounting_transactions_date ON accounting_transactions(team_id, date DESC);
CREATE INDEX idx_accounting_transactions_type ON accounting_transactions(team_id, type);

CREATE TRIGGER update_accounting_transactions_updated_at
BEFORE UPDATE ON accounting_transactions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 10. accounting_categories 테이블 (team_id 추가)
-- =============================================================================

CREATE TABLE accounting_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  color TEXT DEFAULT '#10b981',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT accounting_categories_unique UNIQUE(team_id, name, type)
);

CREATE INDEX idx_accounting_categories_team_id ON accounting_categories(team_id);

-- =============================================================================
-- 11. Row Level Security (RLS) 정책
-- =============================================================================

-- teams 테이블
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- 사용자는 자기 팀만 조회 가능
CREATE POLICY "Users can view their own team"
ON teams
FOR SELECT
USING (
  id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- Admin은 자기 팀 수정 가능
CREATE POLICY "Admin can update their team"
ON teams
FOR UPDATE
USING (
  id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- players 테이블
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team players"
ON players
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- matches 테이블
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team matches"
ON matches
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- upcoming_matches 테이블
ALTER TABLE upcoming_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team upcoming matches"
ON upcoming_matches
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- settings 테이블
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team settings"
ON settings
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- membership_settings 테이블
ALTER TABLE membership_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team membership settings"
ON membership_settings
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- mom_votes 테이블
ALTER TABLE mom_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team mom votes"
ON mom_votes
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- badge_system 테이블
ALTER TABLE badge_system ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team badges"
ON badge_system
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- accounting_transactions 테이블
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team transactions"
ON accounting_transactions
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- accounting_categories 테이블
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their team categories"
ON accounting_categories
FOR ALL
USING (
  team_id = (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
);

-- =============================================================================
-- 12. 유틸리티 함수
-- =============================================================================

-- 팀 통계 업데이트 함수
CREATE OR REPLACE FUNCTION update_team_stats(p_team_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE teams
  SET
    total_players = (SELECT COUNT(*) FROM players WHERE team_id = p_team_id AND status = 'active'),
    total_matches = (SELECT COUNT(*) FROM matches WHERE team_id = p_team_id AND is_void = false)
  WHERE id = p_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 선수 통계 업데이트 트리거 (추후 구현)
-- CREATE TRIGGER update_player_stats_after_match ...

-- =============================================================================
-- 13. 초기 데이터 (선택사항)
-- =============================================================================

-- 기본 회계 카테고리는 팀 생성 시 API에서 추가

-- =============================================================================
-- 완료!
-- =============================================================================

-- 다음 단계:
-- 1. Supabase Dashboard에서 이 스크립트 실행
-- 2. Authentication 설정 (Email/Password 활성화)
-- 3. API Keys 확인 (anon key, service_role key)
-- 4. .env 파일에 환경변수 추가

COMMENT ON TABLE teams IS '멀티테넌트 팀 정보';
COMMENT ON TABLE players IS '팀별 선수 데이터 (team_id로 격리)';
COMMENT ON TABLE matches IS '팀별 매치 데이터 (team_id로 격리)';
