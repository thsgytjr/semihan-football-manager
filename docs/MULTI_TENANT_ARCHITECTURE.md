# 멀티테넌트 아키텍처 설계

> **목표**: 1개의 Supabase + 1개의 Vercel로 무제한 팀 지원  
> **원칙**: 기존 2팀 프로젝트는 그대로 유지 (영향 없음)

---

## 📋 프로젝트 구조

### 기존 구조 (Current)
```
각 팀마다 별도 프로젝트:
- 한강 레인저스 → Supabase Project A + Vercel Deployment A
- 진도FC → Supabase Project B + Vercel Deployment B
```

**문제점:**
- ❌ 새 팀 추가할 때마다 수동 작업 필요 (30분)
- ❌ 10팀+ 되면 관리 불가능
- ❌ 비용 증가 ($25 × 팀 수)

### 새로운 구조 (Multi-Tenant)
```
모든 팀이 하나의 프로젝트 공유:
- Supabase Project (NEW) → 모든 팀 데이터
- Vercel Deployment (1개) → goalify.app
  - /hangang-rangers → 한강 레인저스
  - /jindo-fc → 진도FC
  - /new-team → 새 팀 (자동 생성)
```

**장점:**
- ✅ 새 팀 추가 = 15초
- ✅ 100팀까지 1개 프로젝트로 관리
- ✅ 비용 절감 ($25/월 고정)

---

## 🗄️ 데이터베이스 스키마

### 핵심 개념: team_id로 데이터 격리

```sql
-- 1. teams 테이블 (새로 추가)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 기본 정보
  name TEXT NOT NULL,                    -- "한강 레인저스"
  subdomain TEXT UNIQUE NOT NULL,         -- "hangang-rangers"
  slug TEXT UNIQUE NOT NULL,              -- URL에 사용 (subdomain과 동일)
  
  -- 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 플랜 정보
  plan TEXT DEFAULT 'free',               -- 'free', 'pro', 'enterprise'
  max_players INTEGER DEFAULT 50,         -- 플랜별 제한
  max_storage_mb INTEGER DEFAULT 100,
  
  -- 커스터마이징
  logo_url TEXT,
  primary_color TEXT DEFAULT '#10b981',
  secondary_color TEXT DEFAULT '#3b82f6',
  
  -- 관리
  status TEXT DEFAULT 'active',           -- 'active', 'suspended', 'deleted'
  owner_user_id UUID                      -- Admin 계정
);

-- 인덱스
CREATE INDEX idx_teams_subdomain ON teams(subdomain);
CREATE INDEX idx_teams_slug ON teams(slug);
CREATE INDEX idx_teams_status ON teams(status);


-- 2. 모든 기존 테이블에 team_id 추가
ALTER TABLE players ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE matches ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE upcoming_matches ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE settings ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE membership_settings ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE mom_votes ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE badge_system ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE accounting_transactions ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE accounting_categories ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;
-- ... (모든 테이블)

-- 인덱스 추가 (성능 최적화)
CREATE INDEX idx_players_team_id ON players(team_id);
CREATE INDEX idx_matches_team_id ON matches(team_id);
CREATE INDEX idx_upcoming_matches_team_id ON upcoming_matches(team_id);
-- ... (모든 테이블)


-- 3. Row Level Security (RLS) - 데이터 격리의 핵심!
-- 사용자는 자기 팀 데이터만 볼 수 있음

-- RLS 활성화
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcoming_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mom_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE badge_system ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;
-- ... (모든 테이블)

-- RLS 정책: 자기 팀 데이터만 접근
CREATE POLICY "Users can only access their team data"
ON players
FOR ALL
USING (
  team_id = (
    SELECT (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
  )
);

-- 위 정책을 모든 테이블에 적용
-- (players, matches, upcoming_matches, settings, ...)

-- teams 테이블은 자기 팀 정보만 조회 가능
CREATE POLICY "Users can view their own team"
ON teams
FOR SELECT
USING (
  id = (
    SELECT (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid
  )
);

-- Admin은 팀 정보 수정 가능
CREATE POLICY "Admin can update their team"
ON teams
FOR UPDATE
USING (
  id = (SELECT (auth.jwt() -> 'user_metadata' ->> 'team_id')::uuid)
  AND
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
```

---

## 🔐 인증 시스템

### JWT에 team_id 포함

```javascript
// 로그인 시
const { data: user } = await supabase.auth.signInWithPassword({
  email: 'admin@hangang.com',
  password: 'password'
})

// user.user_metadata에 team_id 포함
// {
//   team_id: 'uuid-123',
//   team_name: '한강 레인저스',
//   role: 'admin'
// }

// 이후 모든 쿼리는 자동으로 해당 팀 데이터만 접근
```

### 회원 역할 구조

```typescript
type UserRole = 'admin' | 'manager' | 'player' | 'viewer'

interface UserMetadata {
  team_id: string
  team_name: string
  role: UserRole
  player_id?: string  // 선수인 경우
}
```

---

## 🚀 온보딩 플로우

### 사용자 경험
```
1. goalify.app 접속
   ↓
2. "팀 만들기" 버튼
   ↓
3. 폼 입력:
   - 팀 이름: "한강 레인저스"
   - 이메일: admin@hangang.com
   - 비밀번호: ********
   ↓
4. POST /api/teams/create
   ↓
5. ⏱️ 15초 대기
   ↓
6. ✅ 완료!
   ↓
7. https://goalify.app/hangang-rangers 로 리다이렉트
```

### 백엔드 처리 (15초 안에 완료)

```javascript
// api/teams/create.js

export default async function handler(req, res) {
  const { teamName, adminEmail, adminPassword } = req.body
  
  // 1. 팀 생성 (1초)
  const subdomain = teamName.toLowerCase().replace(/\s+/g, '-')
  const { data: team } = await supabase
    .from('teams')
    .insert({ name: teamName, subdomain })
    .select()
    .single()
  
  // 2. Admin 계정 생성 (2초)
  const { data: user } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      team_id: team.id,
      team_name: teamName,
      role: 'admin'
    }
  })
  
  // 3. 기본 설정 초기화 (병렬 실행, 5초)
  await Promise.all([
    supabase.from('settings').insert({
      team_id: team.id,
      team_name: teamName,
      season: '2024/25'
    }),
    supabase.from('membership_settings').insert({
      team_id: team.id,
      enabled: false
    }),
    supabase.from('formation_presets').insert([
      { team_id: team.id, name: '4-4-2', formation: '4-4-2' },
      { team_id: team.id, name: '4-3-3', formation: '4-3-3' }
    ])
  ])
  
  // 4. 완료! (총 8초)
  return res.json({
    success: true,
    teamId: team.id,
    dashboardUrl: `https://goalify.app/${subdomain}`
  })
}
```

---

## 🛣️ 라우팅 구조

### URL 패턴
```
https://goalify.app/                    → 온보딩 랜딩 페이지
https://goalify.app/login               → 로그인
https://goalify.app/signup              → 팀 생성

https://goalify.app/hangang-rangers     → 한강 레인저스 대시보드
https://goalify.app/hangang-rangers/players
https://goalify.app/hangang-rangers/matches

https://goalify.app/jindo-fc            → 진도FC 대시보드
https://goalify.app/jindo-fc/players
```

### React Router 구조

```javascript
// App.jsx

function App() {
  return (
    <Routes>
      {/* 공개 페이지 */}
      <Route path="/" element={<OnboardingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      
      {/* 팀별 대시보드 */}
      <Route path="/:subdomain/*" element={<TeamApp />} />
    </Routes>
  )
}

function TeamApp() {
  const { subdomain } = useParams()
  const { team } = useTeam(subdomain)  // team_id 로드
  
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/players" element={<PlayersPage />} />
      <Route path="/matches" element={<MatchesPage />} />
      {/* ... */}
    </Routes>
  )
}
```

---

## 📊 데이터 격리 검증

### 테스트 시나리오

```javascript
// 1. 팀 A 관리자 로그인
await supabase.auth.signInWithPassword({
  email: 'admin@teamA.com',
  password: 'password'
})

// 2. 선수 조회 (팀 A 데이터만 보여야 함)
const { data: players } = await supabase
  .from('players')
  .select('*')
// → 팀 A 선수만 반환 (RLS가 자동 필터링)

// 3. 다른 팀 데이터 직접 접근 시도
const { data: otherTeamData } = await supabase
  .from('players')
  .select('*')
  .eq('team_id', 'team-B-uuid')
// → 빈 배열 반환 (RLS가 차단)

// 4. 팀 B 관리자로 재로그인
await supabase.auth.signOut()
await supabase.auth.signInWithPassword({
  email: 'admin@teamB.com',
  password: 'password'
})

// 5. 선수 조회 (팀 B 데이터만 보여야 함)
const { data: players2 } = await supabase
  .from('players')
  .select('*')
// → 팀 B 선수만 반환
```

---

## 🔄 기존 코드 마이그레이션

### 변경 필요한 부분

```javascript
// ❌ 기존 코드 (team_id 없음)
const { data: players } = await supabase
  .from('players')
  .select('*')

// ✅ 새 코드 (team_id 자동 필터링)
// RLS가 자동으로 처리하므로 코드 변경 불필요!
const { data: players } = await supabase
  .from('players')
  .select('*')
// JWT에서 team_id 추출 → RLS 정책 적용 → 자기 팀 데이터만 반환


// ❌ 기존 코드 (INSERT without team_id)
const { data } = await supabase
  .from('players')
  .insert({ name: '홍길동', position: 'FW' })

// ✅ 새 코드 (team_id 명시)
const { team_id } = useTeam()  // Context에서 가져옴
const { data } = await supabase
  .from('players')
  .insert({ 
    name: '홍길동', 
    position: 'FW',
    team_id  // 추가!
  })
```

### useTeam Hook 구현

```javascript
// src/hooks/useTeam.js

import { createContext, useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const TeamContext = createContext(null)

export function TeamProvider({ children }) {
  const { subdomain } = useParams()
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    async function loadTeam() {
      if (!subdomain) {
        setLoading(false)
        return
      }
      
      // subdomain으로 team 정보 로드
      const { data } = await supabase
        .from('teams')
        .select('*')
        .eq('subdomain', subdomain)
        .single()
      
      setTeam(data)
      setLoading(false)
    }
    
    loadTeam()
  }, [subdomain])
  
  return (
    <TeamContext.Provider value={{ team, loading }}>
      {children}
    </TeamContext.Provider>
  )
}

export function useTeam() {
  const context = useContext(TeamContext)
  if (!context) {
    throw new Error('useTeam must be used within TeamProvider')
  }
  return context
}
```

---

## 💰 비용 계산

### Supabase
```
Free Tier: $0/월
- 500MB Database
- 5GB Bandwidth
- 예상: 50팀 지원 가능

Pro: $25/월
- 8GB Database
- 50GB Bandwidth
- 예상: 800팀 지원 가능

팀당 데이터 사용량:
- 선수 50명 × 매치 100개 = 약 10MB
- 월간 대역폭 = 약 100MB
```

### Vercel
```
Hobby (개인): $0/월
- Serverless Functions 제한 있음

Pro: $20/월
- Serverless Functions 무제한
- 1TB Bandwidth
- 추천!
```

### 총 비용
```
Supabase Pro + Vercel Pro = $45/월
→ 800팀까지 지원 가능
→ 팀당 비용: $0.056/월

과금 모델:
- Free: 무료 (50명 제한)
- Pro: $5/월 (무제한)
- Enterprise: 맞춤 견적

50팀이 Pro 플랜 사용 시:
수익: $250/월
비용: $45/월
순익: $205/월 🎉
```

---

## ✅ 체크리스트

### Phase 1: 설계 (완료)
- [x] 아키텍처 설계
- [x] 데이터베이스 스키마 설계
- [x] RLS 정책 설계
- [x] 라우팅 구조 설계

### Phase 2: 인프라 구축
- [ ] 새 Supabase 프로젝트 생성
- [ ] teams 테이블 생성
- [ ] 모든 테이블에 team_id 추가
- [ ] RLS 정책 적용
- [ ] 인덱스 생성

### Phase 3: 인증 구현
- [ ] Supabase Auth 설정
- [ ] 회원가입/로그인 페이지
- [ ] JWT에 team_id 포함
- [ ] AuthProvider 컴포넌트

### Phase 4: 온보딩 구현
- [ ] 랜딩 페이지 UI
- [ ] 팀 생성 API
- [ ] 자동 초기화 로직
- [ ] 이메일 알림 (선택)

### Phase 5: 코드 마이그레이션
- [ ] useTeam hook 구현
- [ ] 모든 INSERT 쿼리에 team_id 추가
- [ ] TeamProvider로 App 감싸기
- [ ] 라우팅 수정

### Phase 6: 테스트
- [ ] 2개 테스트 팀 생성
- [ ] 데이터 격리 검증
- [ ] 크로스-팀 접근 차단 확인
- [ ] 성능 테스트

### Phase 7: 배포
- [ ] 환경변수 설정
- [ ] Vercel 배포
- [ ] DNS 설정 (선택)
- [ ] 모니터링 설정

---

## 🚨 주의사항

### 기존 2팀 프로젝트
```
❗ 기존 프로젝트는 그대로 유지됩니다!

한강 레인저스:
- Supabase: https://hangang.supabase.co (그대로)
- Vercel: https://hangang.vercel.app (그대로)
- 영향 없음 ✅

진도FC:
- Supabase: https://jindo.supabase.co (그대로)
- Vercel: https://jindo.vercel.app (그대로)
- 영향 없음 ✅

새 멀티테넌트 프로젝트:
- Supabase: https://goalify-multi.supabase.co (NEW)
- Vercel: https://goalify.app (NEW)
- 테스트 후 점진적 마이그레이션
```

### 보안 체크리스트
- [ ] RLS 활성화 확인
- [ ] 모든 테이블에 정책 적용
- [ ] Service Role Key는 서버에서만 사용
- [ ] Anon Key는 클라이언트에서 사용
- [ ] HTTPS 강제
- [ ] Rate Limiting 설정

---

## 📚 다음 단계

1. **지금 당장**: 새 Supabase 프로젝트 생성
2. **오늘 안에**: teams 테이블 + RLS 설정
3. **내일**: 온보딩 API 구현
4. **모레**: 랜딩 페이지 UI
5. **다음 주**: 테스트 팀 2개 생성 및 검증

준비되면 다음 단계로 진행하겠습니다! 🚀
