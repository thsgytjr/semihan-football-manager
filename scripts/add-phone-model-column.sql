-- ========================================
-- Add phone_model column to visit_logs table
-- 방문자 로그에 핸드폰 모델 정보 추가
-- ========================================

-- visit_logs 테이블에 phone_model 컬럼 추가
ALTER TABLE visit_logs 
ADD COLUMN IF NOT EXISTS phone_model TEXT;

-- 인덱스 추가 (통계 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_visit_logs_phone_model 
ON visit_logs(phone_model) 
WHERE phone_model IS NOT NULL;

-- 확인용 쿼리
-- SELECT id, visitor_id, device_type, phone_model, visited_at 
-- FROM visit_logs 
-- ORDER BY visited_at DESC 
-- LIMIT 10;

-- ========================================
-- 완료!
-- 이제 방문자의 핸드폰 모델 정보가 저장됩니다.
-- ========================================
