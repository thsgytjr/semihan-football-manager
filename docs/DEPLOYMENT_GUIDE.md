# Goalify 배포 가이드 (Multi-tenant)

> 여러 팀이 독립 Supabase + Vercel 환경에서 같은 코드베이스로 운영되도록 하는 가이드입니다.

---
## 1. 준비물
- GitHub 저장소 (이 레포)
- Supabase 프로젝트 1개(팀당 1개)
- Vercel 프로젝트 1개(팀당 1개)

---
## 2. Supabase 설정
1) 새 프로젝트 생성 → 암호/리전 선택.
2) SQL Editor에서 다음 스키마 적용:
- matches 테이블 (camelCase 컬럼: `dateISO`, `attendeeIds`, `selectionMode`, ...)
- TIMESTAMPTZ 사용 (시간대 문제 방지)
- `location`은 JSONB 권장

참고: 
- `docs/MIGRATION_QUICK_START.md`
- DKSC 타임존/로케이션 마이그레이션 예시: `scripts/dksc-*.sql`

3) Storage: 프로필 사진/이미지 업로드용 버킷 준비(선택).
4) Auth: 이메일/비번 로그인 활성화(선택).

---
## 3. 환경 변수 (.env)
로컬 개발 (`.env.local`):
```
VITE_TEAM_NAME="팀 이름"
VITE_TEAM_SHORT_NAME="team-short"  # TEAM_CONFIG.shortName와 일치
VITE_TEAM_PRIMARY_COLOR="#10b981"

VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# 미리보기 메타/브랜딩
VITE_APP_DESCRIPTION="Plan. Play. Win. | <TEAM> ..."
VITE_APP_URL="https://your-team.vercel.app"  # 절대 URL (OG/Twitter용)
```

Vercel에도 동일 키를 추가합니다 (Project Settings → Environment Variables). 
- 환경: `Production`, 필요 시 `Preview`도 함께.

---
## 4. 빌드/배포 (Vercel)
1) Vercel에서 "New Project" → GitHub repo 연결.
2) Framework: Vite/React 자동 감지.
3) 환경 변수 입력.
4) Deploy.

팁: 
- `vite.config.js`가 빌드 시 HTML에 OG/Twitter 메타를 주입합니다.
- 환경변수 누락 시 경고 + 안전 기본값으로 빌드되지만, 배포 전 반드시 URL/설명을 채워주세요.

---
## 5. 브랜딩 & 미리보기(OG/Twitter/Kakao)
- 기본 파비콘(`/public/favicon.png`) 사용. 팀 로고를 `public/GoalifyLogo.png`(1200x630)로 추가하면 더 좋은 품질.
- Kakao/카톡 캐시: 링크 바뀌지 않을 때 `?v=timestamp`로 캐시 무효화.
- 절대 URL 필수(`VITE_APP_URL`).

---
## 6. 멀티 테넌트 동작 원리
- DB 범위: `room_id = <TEAM_SHORT>-lite-room-1` 고정 스코프.
- 코드베이스 동일, Supabase URL/KEY만 다르게.
- 빌드 타임에 팀 이름/설명/URL/이미지 메타가 삽입 → 각 Vercel 프로젝트 별도 브랜딩.

---
## 7. 마이그레이션 주의사항
- DKSC/SEM에 동일 스키마 유지 (TIMESTAMPTZ/JSONB).
- 레거시 컬럼명(`date_iso`)은 서비스 레이어에서 호환 처리.
- 대량 마이그레이션 시 트랜잭션 + 백업.

---
## 8. 운영 체크리스트
- [ ] Supabase RLS 정책 점검(운영 데이터 보호)
- [ ] `TEAM_CONFIG.shortName`과 환경 변수 `VITE_TEAM_SHORT_NAME` 일치
- [ ] OG 이미지 존재 여부 및 사이즈 확인
- [ ] 카카오/트위터 카드 미리보기 검사
- [ ] 배포 후 선수/매치 최소 샘플 데이터로 건강 점검

---
## 9. 문제 해결
- 시간대가 어긋남: DB 컬럼이 `TIMESTAMPTZ`인지 확인, 프론트에서 `datetime-local` → `toISOString()` 변환 사용.
- 위치가 안 보임: `location`이 JSONB인지, 문자열(JSON string)인 경우 코드에서 파싱되는지 확인.
- 미리보기 이미지 안 뜸: 절대 URL인지, 이미지 접근 가능한지, 캐시 무효화했는지 확인.

---
## 10. 새 팀 추가 절차 (요약)
1) Supabase 새 프로젝트 생성 → 스키마 적용.
2) Vercel 새 프로젝트 생성 → 동일 repo 연결.
3) 환경 변수 입력 → Deploy.
4) `TEAM_CONFIG.shortName` 확인(필요 시 팀별 브랜치/빌드 설정 고려).
