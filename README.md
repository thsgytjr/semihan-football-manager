# ⚽ Goalify (Football Manager Platform)

멀티 테넌트 아마추어/교회 풋살 동호회 관리 플랫폼 – 선수 관리 · 매치 기록 · 리더보드 · Draft 모드 · 예정 매치 · 회비 분배 · 브랜딩.

## 🎯 핵심 기능 개요

- 선수 관리: CRUD, 능력치(OVR), 멤버십/태그, 프로필 이미지
- 매치 플래너: 예정 매치 생성 → Draft 진행 → 공식 매치 저장 흐름
- Draft 모드: 주장 지정, 팀 구성, 쿼터 점수/승패 집계, 드래프트 전용 리더보드
- 리더보드: 공격 포인트(골+어시) · 듀오(Assist→Goal) · 드래프트 승점 · 주장 승점 · 드래프트 공격 포인트
- 예정 매치(Upcoming): 실시간 참가자/팀 수/드래프트 상태 노출
- AI 팀 배정: 포지션/능력치/과거 성과 기반 고급 균형 알고리즘
- 회비 계산: 멤버/게스트 자동 단가 산출 (게스트 할증 + 0.5단위 반올림)
- 커스텀 팀 색상: 프리셋 + HEX 입력으로 헤더/팀카드 스타일
- 브랜딩/미리보기: OG/Twitter 메타 자동 주입 (팀별 제목/설명/이미지)
- Analytics: 방문자/OS/브라우저/세션 추적

## 🚀 빠른 시작 (Local)

### 로컬 개발
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build
```

### 환경변수 설정 (`.env.local`)
필수 값 누락 시 빌드가 기본 안전값으로 진행되지만 브랜딩/미리보기 품질 저하 가능.
```bash
VITE_TEAM_NAME="팀 이름"
VITE_TEAM_SHORT_NAME="team-short"
VITE_TEAM_PRIMARY_COLOR="#10b981"

VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-key

# 선택/권장 (브랜딩 & 미리보기)
VITE_APP_DESCRIPTION="Plan. Play. Win. | TEAM 소개 문구"
VITE_APP_URL="https://your-team.vercel.app"  # 절대 URL (OG 이미지 경로 기준)
```

## 📦 새 팀 (Multi-tenant) 배포 요약
1. Supabase 새 프로젝트 → SQL 스키마 적용 (TIMESTAMPTZ / JSONB `location`).
2. Vercel 새 프로젝트 → 동일 레포 연결 후 환경변수 입력.
3. 첫 선수/매치 데이터 생성 → 리더보드 정상 동작 확인.

상세 문서: `docs/DEPLOYMENT_GUIDE.md`, 전체 아키텍처: `docs/GOALIFY_OVERVIEW.md`

## 🏗️ 기술 스택
React 19 · Vite · Tailwind · Supabase(PostgreSQL/Storage/Auth) · Vercel · Recharts · dnd-kit

## 📂 구조 (요약)
```
src/
   components/        UI 컴포넌트 (리더보드, 매치 카드 등)
   pages/             라우트 페이지 (Dashboard, MatchPlanner 등)
   lib/               도메인 로직 (leaderboardComputations, matchHelpers, formation...)
   services/          Supabase CRUD 래퍼 (matches.service 등)
   utils/             범용 유틸 (random, avatar 등)
```

## 🎨 커스터마이징 (브랜딩)
- 환경변수 기반: 팀 이름/짧은 이름/대표 색상/설명/URL.
- OG/Twitter 메타 자동 삽입 (배포 시점).
- 팀별 로고: `public/GoalifyLogo.png` 존재 시 자동 사용, 없으면 파비콘.
- 팀 색상: Planner UI에서 팀별 커스텀 컬러 저장 → `teamColors`.

## 📊 핵심 데이터 개념 (요약)
| 엔티티 | 설명 | 예시 필드 |
|--------|------|-----------|
| Player | 능력치/태그/멤버십 | id, name, stats, membership, tags[], positions[] |
| UpcomingMatch | 확정 전 팀/참가자 상태 | id, dateISO, participantIds, teamCount, captainIds, snapshot |
| Match | 공식 저장 매치 (리더보드 반영) | id, dateISO, attendeeIds, snapshot, stats, quarterScores, draft |
| Fees | 회비 계산 결과 | total, memberFee, guestFee, guestSurcharge |
| Leaderboard Rows | 계산된 통계 행 | attackRows, duoRows, draftWinsRows |

## 🔐 보안 & 격리 개요
- 각 팀은 별도 Supabase 프로젝트 → 완전 데이터 격리.
- `room_id` 스코프 필드로 내부 멀티 테넌트 분리.
- RLS 정책 적용 권장 (문서화 예정).
- 공개 리더보드 데이터만 노출, 관리자 기능은 보호.

## 📘 추가 문서
- 전체 시스템: `docs/GOALIFY_OVERVIEW.md`
- 배포 상세: `docs/DEPLOYMENT_GUIDE.md`
- 마이그레이션: `docs/MIGRATION_QUICK_START.md`
- Membership 커스텀: `docs/MEMBERSHIP_CUSTOMIZATION.md`

## 📝 라이선스
MIT License

## 🤝 기여 & 문의
Issue/PR 환영. 기능 확장 제안은 Issue 템플릿 사용 권장.

## 📞 문의
문제가 있으면 GitHub Issues에 올려주세요.

---
> 더 깊은 개념/알고리즘/로드맵은 `docs/GOALIFY_OVERVIEW.md` 참고.

