# JindoFC 프로젝트 셋업 가이드

JindoFC 전용 Football Manager 인스턴스를 배포하기 위한 순서형 안내서입니다. 이미 **Vercel 배포는 완료**되었다고 가정하고, Supabase 구성부터 로컬 검증까지 필요한 모든 단계를 정리했습니다.

---

## 1. Supabase 프로젝트 구성

### 1.1 새 프로젝트 만들기
1. [supabase.com](https://supabase.com) → **New Project**.
2. Region은 한국과 가까운 곳(APAC)으로 선택.
3. 생성 후 **Settings → API**에서 `Project URL`, `anon public key`를 복사해두세요.

### 1.2 전체 스키마 적용
1. Supabase **SQL Editor → New query** 열기.
2. 저장소의 `scripts/new-team-complete-setup.sql` 내용을 붙여넣기.
3. 실행 전 전체 텍스트에서 다음 문자열 치환:

| 원본 | 변경 |
|------|------|
| `NEWTEAM` | `JINDOFC` |
| `NewTeam Football Manager` | `JindoFC Football Manager` |

4. 스크립트 전체를 한 번에 실행 (idempotent라 재실행해도 안전).

### 1.3 JindoFC 기본 데이터 주입
추가로 아래 SQL을 실행해 앱 설정, 멤버십, `appdb` 초기값을 맞춥니다.

```sql
-- 앱 전역 설정
INSERT INTO public.settings (key, value)
VALUES (
	'app_settings',
	'{
		"appTitle": "JINDOFC-FM",
		"appName": "JindoFC Football Manager",
		"seasonRecapEnabled": true,
		"roomId": "jindofc-lite-room-1",
		"features": {
			"players": true,
			"planner": true,
			"draft": true,
			"formation": true,
			"stats": true,
			"accounting": true,
			"analytics": true
		},
		"branding": {
			"primaryColor": "#0ea5e9",
			"secondaryColor": "#0f172a",
			"accentColor": "#38bdf8"
		}
	}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 멤버십 프리셋
INSERT INTO public.membership_settings (name, badge, badge_color, deletable, sort_order)
VALUES 
	('정회원', NULL, 'sky', false, 1),
	('준회원', '준', 'amber', true, 2),
	('게스트', 'G', 'slate', true, 3)
ON CONFLICT (name) DO UPDATE SET
	badge = EXCLUDED.badge,
	badge_color = EXCLUDED.badge_color,
	deletable = EXCLUDED.deletable,
	sort_order = EXCLUDED.sort_order;

-- appdb JSON 초기화
INSERT INTO public.appdb (id, data)
VALUES (
	'jindofc-lite-room-1',
	'{
		"players": [],
		"matches": [],
		"upcomingMatches": [],
		"tagPresets": ["FW", "MF", "DF", "GK"],
		"membershipSettings": [
			{"name": "정회원", "badge": null, "badgeColor": "sky"},
			{"name": "준회원", "badge": "준", "badgeColor": "amber"},
			{"name": "게스트", "badge": "G", "badgeColor": "slate"}
		]
	}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
```

### 1.4 스토리지 버킷 확인
`player-photos` 버킷이 없으면 **Storage → New bucket**에서 생성(공개, 5MB 제한, 이미지 MIME). 필요 시 `scripts/storage-player-photos-setup.sql` 실행으로 정책 자동 구성.

### 1.5 검증 쿼리

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
SELECT * FROM storage.buckets WHERE id='player-photos';
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';
```

---

## 2. 환경 변수 및 설정

### 2.1 `.env.local`
루트에 아래 예시로 작성합니다 (Git에 커밋되지 않음).

```bash
VITE_SUPABASE_URL=https://<your-jindofc>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_TEAM_NAME="JindoFC"
VITE_TEAM_SHORT_NAME="jindofc"
VITE_TEAM_PRIMARY_COLOR="#0ea5e9"
VITE_APP_DESCRIPTION="Train harder. Play smarter. | JindoFC Football Manager"
VITE_APP_URL="https://jindofc-goalify.vercel.app"
VITE_FEATURE_ANALYTICS=true
VITE_FEATURE_DRAFT=true
VITE_FEATURE_UPCOMING=true
```

Vercel에도 동일한 키/값을 Production·Preview·Development 환경에 모두 등록하세요.

### 2.2 팀 설정 파일
`src/lib/teamConfig.js`는 위 환경변수를 그대로 읽습니다. `VITE_TEAM_SHORT_NAME=jindofc`로 지정하면 서비스 전반에서 `ROOM_ID = jindofc-lite-room-1`이 자동으로 적용됩니다.

### 2.3 패키지 정보 및 브랜딩
- `package.json` → `name: "jindofc-football-manager"`, `description: "JindoFC Football Manager"` 권장.
- `public/assets` 로고/파비콘 교체, 필요 시 `src/App.css`나 Tailwind 설정으로 색상 보완.
- `src/i18n/locales`에 팀 슬로건 등 커스텀 문구를 추가해도 좋습니다.

---

## 3. 로컬 개발 절차

1. `npm install`
2. `npm run dev:j` → <http://localhost:5173>
3. 테스트 시나리오
	 - Supabase Auth 로그인 (GitHub/Magic Link 등)
	 - 선수 등록 및 사진 업로드 → `storage.objects`에서 버킷 반영 확인
	 - 경기 생성 → `matches` 테이블에 `room_id = 'jindofc-lite-room-1'` 레코드 생성 여부 확인
4. `npm run build && npm run preview`로 배포 전 로컬 빌드 체크

---

## 4. 최종 점검 체크리스트

- [ ] Supabase `players`, `matches`, `appdb` 등 테이블이 정상 생성되었는가?
- [ ] `player-photos` 버킷 및 접근 정책이 설정되었는가?
- [ ] Vercel 환경 변수와 `.env.local` 값이 모두 일치하는가?
- [ ] 로컬에서 로그인/선수/경기 흐름이 오류 없이 작동하는가?
- [ ] `appdb`의 `jindofc-lite-room-1` 레코드가 UI 변경 시 업데이트되는가?
- [ ] `https://jindofc-goalify.vercel.app` 공유 시 OG 메타 정보가 정상 노출되는가?

위 과정을 마치면 JindoFC 전용 인스턴스가 다른 팀과 완전히 분리된 상태로 운영 가능합니다. 필요 시 이 문서를 기반으로 회계/멤버십 시드 데이터나 추가 자동화 작업을 확장하세요.
