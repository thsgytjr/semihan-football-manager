# Hangang Rangers 배포 & 환경 설정 가이드

> 기존 Semihan / DKSC 와 **동일한 스키마**로 Supabase + Vercel 에서 독립 실행. 멀티테넌트 패턴 유지.

---
## 1. 목표
Hangang Rangers 전용 Supabase 프로젝트와 Vercel 프로젝트를 생성하여 다음을 달성:
- 동일 코드베이스 공유 (이 레포)  
- 팀별 환경변수로 브랜딩/접속/DB 분리  
- `TEAM_CONFIG.shortName` 기반 room scope 유지: `hangang-lite-room-1`  

---
## 2. 준비물 체크리스트
- [ ] GitHub 저장소: `semihan-football-manager` (fork 또는 그대로 사용 가능)  
- [ ] Supabase 새 프로젝트 (Hangang Rangers)  
- [ ] Vercel 새 프로젝트  
- [ ] 팀 로고 / OG 이미지 (1200x630 권장)  
- [ ] 팀 기본 색상 (예: Primary Navy `#1E3A8A`)  

---
## 3. Supabase 프로젝트 생성
1) Supabase Dashboard → New Project  
2) 비밀번호 / Region 선택 (가급적 기존 지역과 동일하여 지연 최소화)  
3) 생성 완료 후 Project Settings → API 탭에서 `PROJECT URL`, `anon public key` 복사 (환경변수에 사용).  

---
## 4. 데이터베이스 스키마 적용 (Semihan/DKSC 동일화)
Hangang Rangers 는 이미 통합된 camelCase 컬럼 세트를 바로 사용해야 합니다. **가장 간단한 방법은 `scripts/unified-db-migration.sql` 한 번 실행**입니다.

### 권장 순서 (최초 비어있는 DB인 경우)
1. (필요시) `matches` / `upcoming_matches` 테이블 생성 스크립트가 없다면 먼저 기본 테이블 생성 (기존 레포에 테이블 생성용 초기 스크립트가 있다면 사용. 없다면 간단 생성 후 진행)  
2. Supabase SQL Editor에서 `scripts/unified-db-migration.sql` 전체 붙여넣고 Run  
3. 필요 시 추가 컬럼/정책 스크립트 실행 (예: 회계/멤버십 관련: `create-accounting-tables.sql`, `create-membership-settings-table.sql`, `create-settings-table.sql`)  
4. (선택) 팀 컬러 확장을 별도로 다루고 싶다면 이미 `unified-db-migration.sql`에 `teamColors` 포함 → 추가 작업 불필요  

### 참고 스크립트 설명
- `unified-db-migration.sql`: Semihan/DKSC 차이를 통합 (camelCase + 인덱스 + 기존 snake_case 호환)  
- `dksc-full-migration.sql`: DKSC 환경에서 teamColors 만 추가하는 경량 스크립트 (통합 후엔 필요 없음)  

### 실행 후 검증 쿼리
마지막 SELECT 결과에 `dateISO`, `attendeeIds`, `teamColors`, `selectionMode`, `teamCount` 등이 표시되면 성공.

### 추가: upcoming_matches 동일성
이미 같은 스크립트 내에서 upcoming_matches 컬럼도 맞춰줍니다. 별도 작업 불필요.

---
## 5. (선택) Storage & Auth 설정
- Storage: `avatars` 버킷 생성 (Public 권한, 또는 RLS로 제한)  
- Auth: Email/Password 활성화 (팀 운영 정책에 따라 소셜 로그인 추가)  

---
## 6. 환경 변수 (.env.local / Vercel)
로컬 개발 시 프로젝트 루트에 `.env.local` 생성:
```bash
VITE_TEAM_NAME="Hangang Rangers"
VITE_TEAM_SHORT_NAME="hangang"
VITE_TEAM_PRIMARY_COLOR="#1E3A8A"  # Navy

VITE_SUPABASE_URL="https://YOUR-SUPABASE-PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_PUBLIC_ANON_KEY"

# 브랜딩 / 메타
VITE_APP_DESCRIPTION="Plan. Play. Win. | Hangang Rangers"
VITE_APP_URL="https://hangang-rangers.vercel.app"

# 기능 토글 (필요시)
VITE_FEATURE_ANALYTICS=true
VITE_FEATURE_DRAFT=true
VITE_FEATURE_UPCOMING=true
```
Vercel → Project Settings → Environment Variables 에 동일 값 추가 (Production + Preview).

### 중요 매핑
`TEAM_CONFIG.shortName` ↔ `VITE_TEAM_SHORT_NAME`  
ROOM_ID 패턴: `${shortName}-lite-room-1` → `hangang-lite-room-1`  
LocalStorage prefix: `${shortName}_` → `hangang_`  

---
## 7. Vercel 배포
1) Vercel 로그인 → Add New Project → GitHub 연결  
2) Repo 선택 (`semihan-football-manager`)  
3) Framework 자동 감지 (Vite/React). Build Command 기본: `vite build` / Output: `dist`  
4) 환경변수 입력 후 Deploy  
5) 배포 완료 후 URL 확인 → `.env.local`의 `VITE_APP_URL`과 실제 도메인 일치 여부 점검  

### OG / 미리보기 이미지
`public/GoalifyLogo.png` 또는 `public/og-hangang.png` 파일을 생성(1200x630).  
메타 태그는 빌드 시 환경변수 기반으로 삽입 (필요시 `index.html` 확인).  

---
## 8. 초기 데이터 / 검증 절차
1) 앱 접속 → 선수 1~2명 추가 → Match 생성 → 저장 확인  
2) Supabase Table Editor에서 `matches` 행에 `dateISO`, `attendeeIds`, `room_id` 채워지는지 확인  
3) upcoming match 생성 (기능 켜져 있다면) → `upcoming_matches` 동일 컬럼 작성 여부 확인  
4) 팀 컬러 커스터마이징: 프론트에서 `teamColors` 입력 시 JSONB 저장되는지 테스트  

---
## 9. 운영 체크리스트
- [ ] RLS 정책(읽기/쓰기 제한) 설정 여부  
- [ ] Index 정상 생성 (performance)  
- [ ] 시간대: `TIMESTAMP` vs `TIMESTAMPTZ` 요구 검토 (통합 스크립트는 `TIMESTAMP`, 필요시 변환)  
- [ ] 환경변수 누락 없는지 (`supabaseClient` 오류 로그 확인)  
- [ ] OG 이미지/미리보기 확인 (Twitter Card / Kakao)  
- [ ] ROOM_ID 스코프 의도대로 동작 (`hangang-lite-room-1`)  

---
## 10. 문제 해결 (FAQ)
| 이슈 | 점검 포인트 |
|------|-------------|
| 매치가 안 저장됨 | Supabase URL/anon key 오타, RLS 차단 여부 |
| 날짜가 어긋남 | DB 컬럼 타입 확인, 클라이언트에서 `toISOString()` 사용 여부 |
| attendeeIds 비어있음 | 프론트에서 선수 선택 로직 정상 실행인지, JSON 형태인지 |
| OG 이미지 미노출 | 절대 URL 사용 여부 / 이미지 200 응답 / 캐시 무효화(`?v=ts`) |
| teamColors 미저장 | 컬럼 존재 여부(`SELECT teamColors FROM matches LIMIT 1`) / JSON 구조 유효성 |

---
## 11. 향후 확장 아이디어
- 팀별 회계 기능 활성화: `create-accounting-tables.sql` 실행 후 UI 토글  
- 멤버십 커스터마이징: `create-membership-settings-table.sql` + `init-membership-settings.sql`  
- 실시간 대시보드: Supabase Realtime subscribe (현재 테이블에 `room_id` 인덱스 이미 존재)  
- 다중 ROOM 지원: `ROOM_ID` 로직을 동적 선택(예: `/?room=hangang-lite-room-2`)  

---
## 12. 요약 (Quick Start)
```text
1. Supabase 새 프로젝트 생성
2. SQL Editor → unified-db-migration.sql 실행
3. .env.local 작성 (팀명/색상/Supabase 키)
4. Vercel 새 프로젝트 → 환경변수 세팅 후 Deploy
5. 매치/선수 생성 테스트 → DB 저장 검증
```

✅ 완료되면 Hangang Rangers 는 Semihan/DKSC 와 동일한 스키마 구조로 독립 운영 가능합니다.

---
## 13. 확인용 미니 쿼리
```sql
-- teamColors / dateISO 존재 여부
SELECT id, "dateISO", "attendeeIds", "teamColors", room_id FROM matches ORDER BY created_at DESC LIMIT 5;
```

---
문의/개선 필요 시: 통합 스키마 스크립트를 기준으로 변경 후 다른 팀에도 동일 적용하세요.
