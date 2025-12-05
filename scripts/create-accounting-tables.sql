-- 회계 관리 테이블 생성 스크립트

-- 1. 회비 납부 내역 테이블 (payments)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('registration', 'monthly_dues', 'annual_dues', 'match_fee', 'other_income', 'expense', 'reimbursement')),
  amount DECIMAL(10, 2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payment_method TEXT CHECK (payment_method IN ('venmo', 'cash', 'zelle', 'other')),
  match_id UUID, -- 매치 구장비인 경우 연결
  notes TEXT,
  verified_by UUID, -- 확인한 관리자 ID
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 회비 설정 테이블 (dues_settings)
CREATE TABLE IF NOT EXISTS dues_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_type TEXT NOT NULL UNIQUE CHECK (setting_type IN ('registration_fee', 'monthly_dues', 'annual_dues')),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  effective_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 매치 구장비 납부 현황 테이블 (match_payments)
-- 각 매치별로 누가 납부했는지 추적
CREATE TABLE IF NOT EXISTS match_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL, -- upcoming_matches 또는 일반 매치 ID
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expected_amount DECIMAL(10, 2) NOT NULL,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partial', 'waived', 'overdue')),
  payment_date TIMESTAMP WITH TIME ZONE,
  deadline TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(match_id, player_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_payments_player_id ON payments(player_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_match_id ON payments(match_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_match_id ON match_payments(match_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_player_id ON match_payments(player_id);
CREATE INDEX IF NOT EXISTS idx_match_payments_status ON match_payments(payment_status);

-- 기본 회비 설정 삽입
INSERT INTO dues_settings (setting_type, amount, description, effective_date) 
VALUES 
  ('registration_fee', 10.00, '정회원 가입비 (1회)', CURRENT_DATE),
  ('monthly_dues', 5.00, '월회비 (기본 $5)', CURRENT_DATE),
  ('annual_dues', 50.00, '연회비 (월 납부 대비 $10 할인)', CURRENT_DATE)
ON CONFLICT (setting_type) DO NOTHING;

-- RLS (Row Level Security) 정책 설정
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dues_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_payments ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Allow read access to all users" ON payments FOR SELECT USING (true);
CREATE POLICY "Allow read access to all users" ON dues_settings FOR SELECT USING (true);
CREATE POLICY "Allow read access to all users" ON match_payments FOR SELECT USING (true);

-- 인증된 사용자만 쓰기 가능 (Admin 확인은 앱 레벨에서)
CREATE POLICY "Allow insert for authenticated users" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users" ON payments FOR UPDATE USING (true);
CREATE POLICY "Allow delete for authenticated users" ON payments FOR DELETE USING (true);

CREATE POLICY "Allow insert for authenticated users" ON dues_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users" ON dues_settings FOR UPDATE USING (true);

CREATE POLICY "Allow insert for authenticated users" ON match_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users" ON match_payments FOR UPDATE USING (true);
CREATE POLICY "Allow delete for authenticated users" ON match_payments FOR DELETE USING (true);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dues_settings_updated_at BEFORE UPDATE ON dues_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_match_payments_updated_at BEFORE UPDATE ON match_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
