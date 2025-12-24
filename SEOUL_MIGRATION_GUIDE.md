# Mission FC: 서울 서버 설정 가이드

## 📋 개요

이 가이드는 Mission FC를 **서울 Supabase 서버**에서 새로 시작하기 위한 설정 방법입니다.

### 서울 프로젝트 정보
- **프로젝트 URL**: https://runhjwwjtaybenxatlrt.supabase.co
- **프로젝트 REF**: `runhjwwjtaybenxatlrt`
- **리전**: ap-northeast-2 (Seoul, AWS)
- **사진 저장소**: Cloudflare R2 (`goalify-assets/missionfc/players/`)

### 소요 시간
- **스키마 설정**: 5분
- **환경 변수 업데이트**: 5분
- **배포 및 테스트**: 5분
- **총 소요 시간**: 약 15분

---

## 🎯 설정 단계

### 1단계: 데이터베이스 스키마 생성 (5분)

#### 스키마 생성 스크립트 실행

1. 서울 Supabase 대시보드 열기:
   ```
   https://supabase.com/dashboard/project/runhjwwjtaybenxatlrt
   ```

2. 메뉴 이동: **SQL Editor** > **New Query**

3. 파일 열기: `scripts/missionfc-seoul-setup.sql`

4. **전체 내용**을 복사해서 SQL Editor에 붙여넣기

5. **Run** 클릭 (또는 Cmd+Enter)

6. 성공 확인:
   - ✅ "Created X of X expected tables" 메시지 표시
   - ✅ 테이블 목록과 크기 표시
   - ✅ "Storage bucket player-photos exists and is ready" 표시

**생성될 테이블 목록:**
- players
- appdb
- visit_logs
- settings
- membership_settings
- matches
- upcoming_matches
- mom_votes
- **ref_events** (심판모드 실시간 이벤트)
- payments
- dues_settings
- match_payments
- badge_definitions
- player_badges
- player_badge_progress
- runner_scores

---

### 2단계: 선수 사진 저장소 확인 (1분)

#### ✅ Cloudflare R2 사용 중

Mission FC는 선수 사진을 **Cloudflare R2**에 저장하므로 별도 마이그레이션이 **필요 없습니다**.

**현재 경로 (변경 없음):**
```
https://cdn.goalify.app/goalify-assets/missionfc/players/[player-id].jpg
```

**확인 사항:**

1. **데이터베이스의 photo_url 확인:**
   ```sql
   SELECT name, photo_url FROM players 
   WHERE photo_url IS NOT NULL 
   LIMIT 5;
   ```

2. **URL 형식이 올바른지 확인:**
   - ✅ `https://cdn.goalify.app/goalify-assets/missionfc/players/xxxxx.jpg`
   - ❌ Supabase storage URL이면 R2로 변경 필요

3. **사진이 정상적으로 로드되는지 브라우저에서 테스트**

**💡 참고:** 
- Cloudflare R2는 글로벌 CDN이므로 한국에서도 빠른 속도 제공
- Supabase 서버 위치와 무관하게 동일한 성능 유지
- 추가 마이그레이션 작업 불필요

---

### Phase 5: Configuration Updates (5 minutes)

#### Step 1: Update Environment File

1. Open `.env.missionfc`

2. Replace Supabase credentials with Seoul project:

```bash
---

### 5단계: 설정 업데이트 (5분)

#### 단계 1: 환경 변수 파일 업데이트

1. `.env.missionfc` 파일 열기

2. Supabase 인증 정보를 서울 프로젝트로 교체:

```bash
# 기존 (미국 서버)
VITE_SUPABASE_URL=https://vupsurqljpuharihvtwf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 새로운 (서울 서버)
VITE_SUPABASE_URL=https://runhjwwjtaybenxatlrt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1bmhqd3dqdGF5YmVueGF0bHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MjI2NDIsImV4cCI6MjA4MjA5ODY0Mn0.23wJaWzrPauBt8Ij7LsPV3_-L3z3s2WAEtkTXP4o3ps
```

3. 서울 프로젝트 인증 정보 (이미 확인됨):
   - **Project URL**: `https://runhjwwjtaybenxatlrt.supabase.co`
   - **anon public key**: (위의 전체 키 사용)
   - 확인 방법: **Settings** → **API**

4. R2 경로는 **그대로 유지** (변경 없음):
   ```bash
   VITE_R2_PUBLIC_BASE=https://cdn.goalify.app/goalify-assets/missionfc
   ```

#### 단계 2: 로컬 테스트

1. 로컬에서 빌드 및 실행:
   ```bash
   npm run dev:m
   ```

2. 확인사항:
   - ✅ 로그인 작동
   - ✅ 선수 목록과 사진 표시
   - ✅ 경기 기록 로드
   - ✅ 새 경기/선수 생성 가능
   - ✅ 통계 및 회계 데이터 표시

3. 콘솔 에러 확인
   VITE_SUPABASE_URL → [SEOUL_PROJECT_URL]
---

### 4단계: Vercel 배포 (5분)

#### Vercel 환경 변수 업데이트:

1. Vercel 설정 페이지 이동: https://vercel.com/[your-team]/mission-fc-goalify/settings/environment-variables

2. **Production** 환경의 변수들 업데이트:
   ```
   VITE_SUPABASE_URL → https://runhjwwjtaybenxatlrt.supabase.co
   VITE_SUPABASE_ANON_KEY → eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1bmhqd3dqdGF5YmVueGF0bHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MjI2NDIsImV4cCI6MjA4MjA5ODY0Mn0.23wJaWzrPauBt8Ij7LsPV3_-L3z3s2WAEtkTXP4o3ps
   VITE_TEAM_NAME → Mission FC
   VITE_TEAM_SHORT_NAME → missionfc
   VITE_R2_PUBLIC_BASE → https://cdn.goalify.app/goalify-assets/missionfc
   ```

3. **Save** 클릭

4. 새 배포 트리거:
   ```bash
   # 로컬 프로젝트에서
   git commit --allow-empty -m "서울 Supabase로 전환"
   git push
   ```

5. 또는 Vercel 대시보드 사용: **Deployments** → **Redeploy**
---

## ✅ 설정 완료 후 검증

### 체크리스트:

1. **인증**
   - [ ] 기존 계정으로 로그인 가능
   - [ ] 새 사용자 생성 가능
   - [ ] 비밀번호 재설정 작동

2. **선수**
   - [ ] 모든 선수가 명단에 표시됨
   - [ ] 선수 사진이 정상적으로 로드됨
   - [ ] 선수 추가/수정/삭제 가능
   - [ ] 통계가 제대로 표시됨

3. **경기**
   - [ ] 과거 경기 기록 표시
   - [ ] 경기 상세 정보 로드 (팀, 점수, 통계)
   - [ ] 예정 경기 생성 가능
   - [ ] 드래프트 모드 작동
---

### 3단계: 환경 변수 업데이트 (5분)
   - [ ] 재무 대시보드에 올바른 총액 표시
   - [ ] 새 결제 추가 가능
---

## 🚨 롤백 계획 (문제 발생 시)

문제가 발생하면 미국 서버로 되돌리기:

1. **Vercel 환경 변수를 미국 인증 정보로 복원:**
   ```
   VITE_SUPABASE_URL=https://vupsurqljpuharihvtwf.supabase.co
   VITE_SUPABASE_ANON_KEY=[기존_미국_KEY]
   ```

2. **Vercel 재배포**

3. **로컬 `.env.missionfc`도 미국 인증 정보로 복원**

4. **서울 프로젝트는 안정화될 때까지 테스트용으로 유지**
4. **Keep Seoul project for testing until stable**
---

## 📊 데이터 검증 쿼리

서울 SQL Editor에서 실행하여 데이터 무결성 확인:

```sql
-- 테이블별 레코드 수 확인
SELECT 
  'players' as table_name, COUNT(*) as row_count FROM players
UNION ALL
SELECT 'matches', COUNT(*) FROM matches
UNION ALL
SELECT 'upcoming_matches', COUNT(*) FROM upcoming_matches
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'settings', COUNT(*) FROM settings
UNION ALL
SELECT 'membership_settings', COUNT(*) FROM membership_settings
UNION ALL
SELECT 'mom_votes', COUNT(*) FROM mom_votes
UNION ALL
SELECT 'badge_definitions', COUNT(*) FROM badge_definitions
UNION ALL
SELECT 'player_badges', COUNT(*) FROM player_badges
UNION ALL
SELECT 'ref_sessions', COUNT(*) FROM ref_sessions;

-- 시스템 계정 존재 확인
SELECT id, name, status FROM players WHERE status = 'system';

-- 최근 경기 확인
SELECT 
  id, 
  "dateISO", 
  mode, 
  location->>'name' as location,
  jsonb_array_length("attendeeIds") as attendees
FROM matches 
ORDER BY "dateISO" DESC 
LIMIT 1;

-- 설정 확인
SELECT key, value FROM settings WHERE key = 'app_settings';

-- 사진 URL 확인 (Cloudflare R2 경로)
SELECT 
  COUNT(*) as players_with_photos,
  COUNT(*) FILTER (WHERE photo_url LIKE '%cdn.goalify.app%') as cloudflare_photos
FROM players 
WHERE photo_url IS NOT NULL;

-- 활성 심판모드 세션 확인 (서울 서버에는 없어야 정상)
SELECT COUNT(*) as active_ref_sessions FROM ref_sessions WHERE status = 'active';
```

---

## 💡 팁

1. **트래픽이 적은 시간에 마이그레이션 진행** (한국 시간 야간)

2. **미국 프로젝트를 1주일간 백업으로 유지**

3. **가능하면 staging/dev 환경에서 먼저 철저히 테스트**

4. **참고용으로 미국 대시보드 데이터 스크린샷 촬영**

5. **스키마에 없는 커스텀 RLS 정책이나 함수를 문서화**

6. **마이그레이션 후 Vercel 에러 로그 모니터링**
5. **Document any custom RLS policies** or functions not in schema

---

## 🆘 문제 해결

### 문제: "relation does not exist" 에러

**해결책:** 스키마가 제대로 생성되지 않음. `missionfc-seoul-setup.sql` 재실행

---

### 문제: 로그인할 수 없음

**해결책:** 
1. Vercel 환경 변수가 올바르게 업데이트되었는지 확인
2. 서울 Supabase URL과 키 검증
3. 첫 사용자는 Supabase Dashboard에서 생성: Authentication → Add User
4. Auth 설정 확인: Settings → Authentication → Email/Password 활성화

---

### 문제: 선수 사진 업로드 안 됨

**해결책:**
1. Cloudflare R2 설정 확인
2. 환경 변수 `VITE_R2_PUBLIC_BASE` 올바른지 확인
3. R2 버킷 접근 권한 확인

---

### 문제: 빈 페이지만 표시됨

**해결책:**
1. 브라우저 콘솔에서 에러 확인
2. Vercel 로그 확인: Deployments → [최신] → Runtime Logs
3. Supabase 연결 확인: Settings → API → Project URL이 올바른지
4. 캐시 삭제 후 새로고침 (Cmd+Shift+R)
3. Enable Supabase connection pooler: Settings → Database → Connection Pooling
---

## 📞 지원

문제가 발생하면:

1. **Supabase 로그 확인:** Dashboard → Logs → API/Database
2. **Vercel 로그 확인:** Vercel Dashboard → Deployments → [최신] → Runtime Logs
3. **브라우저 콘솔 검토** (클라이언트 측 에러)

---

## ✨ 설정 완료 기준

다음 조건이 충족되면 설정 완료:

- ✅ 16개 테이블이 모두 생성됨
- ✅ 기본 설정 (app_settings, membership_settings) 존재
- ✅ 로그인 가능 (Dashboard에서 생성한 사용자)
- ✅ 선수 추가/수정 가능
- ✅ 경기 생성 가능
- ✅ 콘솔 에러 없음
- ✅ 한국에서 빠른 로딩 속도 체감

---

**총 소요 시간:** 약 15분 ⚡️
- Have 2-hour window for testing
- Keep US server running for 1 week as fallback
