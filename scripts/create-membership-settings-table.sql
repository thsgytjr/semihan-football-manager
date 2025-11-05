-- ========================================
-- 멤버십 설정 테이블 생성
-- appdb를 건드리지 않는 안전한 방법
-- ========================================

-- 1. membership_settings 테이블 생성
CREATE TABLE IF NOT EXISTS membership_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- 멤버십 이름 (예: "정회원", "준회원", "골키퍼")
  badge TEXT, -- 배지 텍스트 (1글자, 예: "준", "G", "골")
  badge_color TEXT DEFAULT 'stone', -- 배지 색상 (red, orange, amber, emerald, blue, purple, pink, rose, stone)
  deletable BOOLEAN DEFAULT true, -- 삭제 가능 여부
  sort_order INTEGER DEFAULT 0, -- 정렬 순서
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_membership_settings_name ON membership_settings(name);
CREATE INDEX IF NOT EXISTS idx_membership_settings_sort_order ON membership_settings(sort_order);

-- 3. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_membership_settings_updated_at 
  BEFORE UPDATE ON membership_settings 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 4. 기본 멤버십 데이터 삽입 (이미 있으면 스킵)
INSERT INTO membership_settings (name, badge, badge_color, deletable, sort_order)
VALUES 
  ('정회원', NULL, 'emerald', true, 1),
  ('준회원', '준', 'amber', true, 2),
  ('게스트', 'G', 'rose', true, 3)
ON CONFLICT (name) DO NOTHING;

-- 5. RLS (Row Level Security) 설정 - 모든 사용자가 읽기 가능
ALTER TABLE membership_settings ENABLE ROW LEVEL SECURITY;

-- 읽기 권한: 모두 허용
CREATE POLICY "membership_settings_select_policy" 
  ON membership_settings FOR SELECT 
  USING (true);

-- 쓰기 권한: 인증된 사용자만 (관리자)
CREATE POLICY "membership_settings_insert_policy" 
  ON membership_settings FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "membership_settings_update_policy" 
  ON membership_settings FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "membership_settings_delete_policy" 
  ON membership_settings FOR DELETE 
  USING (auth.role() = 'authenticated');

-- 6. 확인 쿼리
SELECT * FROM membership_settings ORDER BY sort_order;

-- ========================================
-- 완료!
-- ✅ 새로운 membership_settings 테이블 생성
-- ✅ 기본 멤버십 3개 추가
-- ✅ RLS 설정 완료
-- ✅ appdb는 건드리지 않음 (안전!)
-- ========================================
