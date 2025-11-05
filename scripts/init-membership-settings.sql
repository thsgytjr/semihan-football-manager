-- 멤버십 설정 초기화 스크립트
-- appdb 테이블의 data JSONB에 membershipSettings 필드 추가

-- 1. membershipSettings가 없는 레코드에 빈 배열 추가
UPDATE appdb 
SET data = data || '{"membershipSettings":[]}'::jsonb 
WHERE data->>'membershipSettings' IS NULL;

-- 2. (선택사항) 기본 멤버십 설정으로 초기화
-- 기존 3가지 멤버십을 기본값으로 설정하려면 아래 쿼리 실행
UPDATE appdb 
SET data = jsonb_set(
  data, 
  '{membershipSettings}', 
  '[
    {"id":"member","name":"정회원","badge":null,"color":"emerald","deletable":true},
    {"id":"associate","name":"준회원","badge":"준","badgeColor":"amber","deletable":true},
    {"id":"guest","name":"게스트","badge":"G","badgeColor":"rose","deletable":true}
  ]'::jsonb
)
WHERE data->>'membershipSettings' = '[]';

-- 3. 확인 쿼리
SELECT 
  appid, 
  data->>'membershipSettings' as membership_settings 
FROM appdb 
LIMIT 10;
