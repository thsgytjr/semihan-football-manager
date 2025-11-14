# Hangang Rangers — Vercel 배포 가이드

이 문서는 Hangang Rangers 팀을 Vercel에 배포하기 위한 실전 단계입니다. 이미 Supabase 스키마는 Semihan/DKSC와 동기화(schema_in_sync=true) 되었다고 가정합니다.

## 0) 준비물
- GitHub 저장소: thsgytjr/semihan-football-manager (본 레포)
- Supabase 프로젝트 (Hangang):
  - URL: https://YOUR-HANGANG.supabase.co
  - anon 키: public-anon-key
- 팀 브랜딩 정보:
  - 팀 이름: Hangang Rangers
  - 짧은 이름: hangang
  - 대표 색상: 예) #2563eb (blue-600)
  - 설명: 예) "Plan. Play. Win. | Hangang Rangers"
  - 앱 도메인: 예) https://hangang-football-manager.vercel.app (배포 후 갱신 가능)

## 1) Vercel 프로젝트 생성
1. Vercel 대시보드 → New Project
2. Git 저장소 연결: thsgytjr/semihan-football-manager 선택
3. 프레임워크는 Vite로 자동 인식됨 (수동 설정 시):
   - Build Command: `npm run build`
   - Output Directory: `dist`

## 2) 환경변수 설정 (Vercel Project → Settings → Environment Variables)
다음 VITE_* 변수들을 Production(필수), Preview/Development(선택)에 입력하세요.

필수
- VITE_TEAM_NAME = Hangang Rangers
- VITE_TEAM_SHORT_NAME = hangang
- VITE_TEAM_PRIMARY_COLOR = #2563eb
- VITE_SUPABASE_URL = https://YOUR-HANGANG.supabase.co
- VITE_SUPABASE_ANON_KEY = YOUR_PUBLIC_ANON_KEY

권장 (브랜딩/미리보기)
- VITE_APP_DESCRIPTION = Plan. Play. Win. | Hangang Rangers
- VITE_APP_URL = https://hangang-football-manager.vercel.app

선택 (기능 토글, 기본값 true)
- VITE_FEATURE_ANALYTICS = true
- VITE_FEATURE_DRAFT = true
- VITE_FEATURE_UPCOMING = true

메모
- `src/lib/teamConfig.js`에서 위 변수들을 읽어 Supabase 클라이언트와 브랜딩을 구성합니다.
- `vite.config.js`는 VITE_* 설정을 HTML 메타 태그에 반영합니다.

## 3) 배포
1. 환경변수 저장 후 `Deploy` 클릭
2. 최초 배포가 완료되면 URL 확인: https://hangang-football-manager.vercel.app (혹은 Vercel이 제공한 도메인)
3. 도메인이 확정되면 Vercel 환경변수 `VITE_APP_URL`을 실제 도메인으로 업데이트 → 재배포

## 4) Supabase Auth 설정 (초대 이메일 → 비밀번호 설정)

Supabase Dashboard → Authentication → URL Configuration 에서 아래 설정을 반영하세요:

### Site URL
- Production 도메인으로 설정: `https://hangang-football-manager.vercel.app`
- 초대 이메일의 기본 링크가 이 URL을 베이스로 전송됩니다.

### Redirect URLs (Additional Redirect URLs)
- Production: `https://hangang-football-manager.vercel.app/**`
- Preview (선택): `https://*-hangang-football-manager.vercel.app/**`
- Localhost (개발): `http://localhost:5173/**`

### 초대 플로우
1. Supabase Admin Panel → Authentication → Users → Invite User
   - 이메일 입력, redirectTo 파라미터로 `/` 또는 생략 (기본 Site URL 사용)
2. 초대 대상자가 이메일에서 링크를 클릭하면:
   - URL hash에 `#access_token=...&type=invite` 토큰이 포함되어 앱으로 이동
   - `InviteSetupPage`가 토큰을 감지하고 비밀번호 설정 UI를 표시
3. 사용자가 비밀번호를 입력하면 `supabase.auth.updateUser({ password })`로 설정
4. 완료 후 메인 페이지로 자동 리다이렉트 + 세션 활성화 → Admin 권한 획득

### 코드 구현 위치
- `src/pages/InviteSetupPage.jsx`: 비밀번호 설정 페이지
- `src/App.jsx`: URL hash에서 `type=invite` 감지 시 InviteSetupPage 표시
- Supabase inviteUserByEmail 사용 예시:
  ```js
  await supabase.auth.admin.inviteUserByEmail('user@example.com', {
    redirectTo: 'https://hangang-football-manager.vercel.app/'
  })
  ```

## 5) 동작 확인 체크리스트
- 선수/매치 CRUD 정상 동작 (Supabase에 반영)
- 예정 매치(Upcoming) 표시/드래프트 플로우
- 리더보드 집계 (매치 저장 후 반영)
- 헤더/OG 미리보기: 팀 이름/설명/이미지 URL 주입 확인
- Analytics(선택): 방문 로그 `visit_logs`에 room_id 기반으로 기록
- **초대 이메일 → 비밀번호 설정 플로우**: Invite User 후 링크 클릭 → 비밀번호 설정 페이지 정상 렌더 → 저장 완료 후 자동 로그인

## 6) 문제 해결 팁
- Supabase 401/URL 문제: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 재확인
- 메타/브랜딩 반영 안 됨: `VITE_TEAM_NAME`/`VITE_APP_DESCRIPTION`/`VITE_APP_URL` 확인 후 재배포
- 데이터 안 보임: `TEAM_CONFIG.shortName`에서 room_id = `hangang-lite-room-1` 사용됨 → 기존 데이터가 다른 room_id라면 변경 필요
- **초대 링크가 localhost로 열림**: Supabase Auth → URL Configuration → Site URL을 실제 도메인으로 설정 + Additional Redirect URLs에 도메인 패턴 추가
- **비밀번호 설정 페이지가 안 보임**: URL hash에 `type=invite`와 `access_token`이 있는지 확인 (브라우저 주소창 #... 부분)

## 7) 로컬 개발 (옵션)
- `.env.hangang` 파일을 루트에 생성하고 아래 예제를 채운 뒤 `npm run dev:h`로 실행하세요.

참고 파일: `.env.hangang.example`
