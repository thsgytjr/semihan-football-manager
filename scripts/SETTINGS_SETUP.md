# 기능 활성화 설정 (Feature Flags) 설정 가이드

## 개요
이 기능은 어드민이 각 탭(선수 관리, 매치 플래너, 드래프트, 포메이션 보드, 기록 입력)의 표시 여부를 제어할 수 있게 합니다.

**중요:** 기능을 비활성화해도 **기존 데이터(매치, 선수, 히스토리)는 삭제되지 않습니다**. 단순히 UI에서 보이지 않을 뿐입니다.

## Supabase 설정

### 1. SQL 실행
Supabase Dashboard에서 다음 SQL 파일을 실행하세요:

```bash
# scripts/create-settings-table.sql 파일의 내용을 복사하여
# Supabase Dashboard > SQL Editor에서 실행
```

또는 직접 SQL 복사:

```sql
-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Insert default settings
INSERT INTO settings (key, value)
VALUES (
  'app_settings',
  '{
    "appTitle": "Semihan-FM",
    "appName": "Semihan Football Manager",
    "tutorialEnabled": true,
    "features": {
      "players": true,
      "planner": true,
      "draft": true,
      "formation": true,
      "stats": true
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access to settings"
  ON settings FOR SELECT USING (true);

CREATE POLICY "Allow public update access to settings"
  ON settings FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public insert access to settings"
  ON settings FOR INSERT WITH CHECK (true);
```

### 2. 확인
Supabase Dashboard > Table Editor에서 `settings` 테이블을 확인하세요.

## 사용 방법

### 어드민 설정 접근
1. 어드민으로 로그인
2. 헤더 우측의 **설정 버튼** (⚙️) 클릭
3. "기능 활성화 설정" 섹션에서 각 기능 토글

### 기능별 설명

| 기능 | 키 | 설명 | 권한 |
|------|-----|------|------|
| 선수 관리 | `players` | 선수 생성/수정/삭제 | Admin 전용 |
| 매치 플래너 | `planner` | 매치 생성, 팀 배정 | Admin 전용 |
| 드래프트 | `draft` | 드래프트 모드 | Admin 전용 |
| 포메이션 보드 | `formation` | 포메이션 시각화 | 모든 사용자 |
| 기록 입력 | `stats` | 골/어시 기록 입력 | Admin 전용 |

### 동기화
- 모든 설정은 **Supabase 데이터베이스**에 저장됩니다
- 변경사항은 **모든 디바이스/브라우저에 즉시 반영**됩니다
- 로컬 스토리지는 폴백용으로만 사용됩니다

## 데이터 보존

### ✅ 보존되는 데이터
기능을 비활성화해도 다음 데이터는 **절대 삭제되지 않습니다**:
- 저장된 매치 (matches)
- 선수 정보 (players)
- 매치 히스토리
- 통계 기록

### 🔄 재활성화
기능을 다시 활성화하면:
- 이전에 저장된 모든 데이터가 그대로 표시됩니다
- 아무것도 손실되지 않습니다

## 개발자 정보

### 파일 구조
```
src/
  lib/
    appSettings.js         # 설정 관리 로직
  App.jsx                  # 메인 앱, 기능 토글 적용
scripts/
  create-settings-table.sql  # Supabase 테이블 생성 SQL
  SETTINGS_SETUP.md         # 이 문서
```

### API 함수
```javascript
// 설정 로드
const settings = await loadAppSettingsFromServer()

// 단일 기능 업데이트
await updateFeatureEnabled('players', true)

// 모든 기능 업데이트
await updateAllFeatures({
  players: true,
  planner: false,
  // ...
})
```

### State 구조
```javascript
const featuresEnabled = {
  players: true,
  planner: true,
  draft: true,
  formation: true,
  stats: true
}
```

## 문제 해결

### 설정이 저장되지 않는 경우
1. Supabase 연결 확인
2. `.env` 파일에서 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 확인
3. Supabase RLS 정책 확인

### 기능이 표시되지 않는 경우
1. 어드민 로그인 확인
2. 설정 다이얼로그에서 해당 기능 활성화 상태 확인
3. 브라우저 새로고침

### 데이터가 사라진 경우
**이럴 수 없습니다!** 기능 활성화 설정은 UI 표시만 제어합니다.
- Supabase `players`, `shared_data` 테이블 확인
- 기능을 다시 활성화하면 데이터가 표시됩니다

## 업데이트 이력
- 2025-11-02: 초기 구현 - 기능 활성화 설정 추가
