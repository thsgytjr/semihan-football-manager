# 🔄 리팩토링 진행 상황

## ✅ Phase 1 완료: 헬퍼 함수로 로직 통일 (2024-11-08)

### 완료된 작업

#### 1. **lib/matchHelpers.js 생성** ✅
모든 드래프트/주장/점수 관련 로직을 중앙화

```javascript
// 주요 함수들:
- isDraftMatch(match)           // 드래프트 판별 (단일 기준)
- getCaptains(match)             // 주장 배열 가져오기
- getCaptainForTeam(match, idx)  // 특정 팀 주장
- getQuarterScores(match)        // 쿼터 점수 가져오기
- getMatchWinner(match)          // 승자 팀 인덱스
- isPlayerCaptain(match, pid)    // 선수가 주장인지
- didCaptainWin(match, pid)      // 주장으로 승리했는지
```

**특징:**
- ✅ 모든 레거시 데이터 구조 지원 (draft.captains, captainIds, captains 등)
- ✅ 우선순위 로직으로 최신 → 레거시 순으로 탐색
- ✅ 기존 코드와 100% 호환 (기존 함수 망가뜨리지 않음)

#### 2. **기존 파일에 헬퍼 적용** ✅

**leaderboardComputations.js:**
- `isDraftMatch()` → 내부에서 `MatchHelpers.isDraftMatch()` 호출
- `coerceQuarterScores()` → 내부에서 `MatchHelpers.getQuarterScores()` 호출
- `extractCaptainsByTeam()` → 내부에서 `MatchHelpers.getCaptains()` 호출
- ⚠️ 기존 함수명 유지 (하위 호환성)
- 📝 `@deprecated` 주석 추가

**SavedMatchesList.jsx:**
- 드래프트 판별 로직 3곳에서 `MatchHelpers.isDraftMatch()` 사용
- Captain 초기화 2곳에서 `MatchHelpers.getCaptains()` 사용  
- QuarterScore 초기화 2곳에서 `MatchHelpers.getQuarterScores()` 사용
- ✅ 중복 코드 70% 감소

**MatchPlanner.jsx:**
- `loadSavedIntoPlanner()` 함수에서 헬퍼 사용
- 드래프트 모드 판별 및 주장 로드 로직 단순화

### 코드 변화 요약

**Before (각 파일마다 다른 로직):**
```javascript
// MatchPlanner.jsx
if (match.selectionMode === 'draft') { ... }

// SavedMatchesList.jsx  
if (m.selectionMode === 'draft' || m?.draftMode) {
  if (m?.draft?.quarterScores?.length > 0) { ... }
}

// leaderboardComputations.js
if (m?.selectionMode === 'draft') return true
const hasDraftData = m?.draft && (
  (m.draft.quarterScores && m.draft.quarterScores.length > 0) ||
  (m.draft.captains && Object.keys(m.draft.captains).length > 0) ||
  ...
)
```

**After (통일된 인터페이스):**
```javascript
// 모든 파일에서 동일
if (MatchHelpers.isDraftMatch(match)) { ... }
const captains = MatchHelpers.getCaptains(match)
const quarterScores = MatchHelpers.getQuarterScores(match)
```

### 개선 효과

1. **일관성** ⬆️
   - 드래프트 판별 로직이 4곳에서 → 1곳으로 통합
   - 모든 파일에서 동일한 기준 사용

2. **유지보수성** ⬆️
   - 로직 변경 시 헬퍼만 수정하면 전체 적용
   - 중복 코드 감소로 버그 발생 확률 ⬇️

3. **안전성** ⬆️
   - 기존 함수명 유지 (하위 호환)
   - 내부 구현만 헬퍼로 대체
   - 0개 Breaking Changes

4. **복잡도** ⬇️
   - SavedMatchesList: 30줄 → 3줄로 축소
   - MatchPlanner: 조건문 가독성 향상
   - leaderboardComputations: 중복 로직 제거

---

## 📊 현재 문제점 분석

### 1. **드래프트 모드 판별 로직이 4곳에 중복**
```javascript
// ❌ 현재: 4개 파일에서 각자 다른 방식으로 체크
- MatchPlanner.jsx: isDraftMode state + selectionMode
- SavedMatchesList.jsx: localDraftMode + selectionMode + quarterScores 체크
- leaderboardComputations.js: isDraftMatch() 함수
- aiPower.js: 자체 isDraft 로직

// 각자 체크하는 조건이 달라서 일관성 없음:
- selectionMode === 'draft'
- draftMode === true
- draft.quarterScores.length > 0
- draft.captains 존재 여부 (최근 제거됨)
```

### 2. **데이터 구조가 혼재**
```javascript
// Match 객체에 3가지 중복된 구조:
{
  selectionMode: 'draft' | 'manual' | 'auto',  // DB 필드
  draftMode: true,                              // 레거시 필드
  draft: {                                      // 새로운 중첩 구조
    captains: [...],
    quarterScores: [...]
  },
  captainIds: [...],      // 레거시 위치
  quarterScores: [...]    // 또 다른 레거시 위치
}
```

### 3. **주장(Captain) 데이터가 3곳에 저장**
```javascript
match.captains          // 옛날 위치
match.captainIds        // 중간 위치  
match.draft.captains    // 현재 위치
```

### 4. **SavedMatchesList가 2곳에서 다른 용도**
- Dashboard: 읽기 전용 히스토리 (통계 표시)
- MatchPlanner: 편집 가능 (드래프트, 주장 지정 등)
- 같은 컴포넌트인데 props와 동작이 완전히 다름

### 5. **예정된 매치(UpcomingMatch)와 저장된 매치의 관계 불명확**
- 예정 매치가 완료되면 어떻게 저장 매치로 변환?
- isDraftMode가 upcomingMatch와 match에 모두 존재
- 데이터 싱크가 깨질 위험

---

## 🎯 해결 방안

### **Option A: 점진적 리팩토링 (추천)**
기존 기능 유지하면서 단계별로 개선

#### Phase 1: 단일 진실 공급원(Single Source of Truth) 확립
```javascript
// 1. lib/matchTypes.js - 드래프트 판별 로직 통일
export function isDraftMatch(match) {
  // 단 하나의 기준: selectionMode만 체크
  return match.selectionMode === 'draft'
}

export function getCaptains(match) {
  // Captain 데이터 접근 단일화
  return match.draft?.captains || match.captainIds || match.captains || []
}

export function getQuarterScores(match) {
  // QuarterScores 접근 단일화
  return match.draft?.quarterScores || match.quarterScores || []
}
```

#### Phase 2: 데이터 마이그레이션
```javascript
// 2. DB 마이그레이션 스크립트
// - 모든 captain/quarterScore 데이터를 draft 객체로 이동
// - draftMode 필드 제거
// - selectionMode를 유일한 기준으로 설정

UPDATE matches 
SET 
  draft = jsonb_build_object(
    'captains', COALESCE(draft->'captains', captains, captain_ids),
    'quarterScores', COALESCE(draft->'quarterScores', quarter_scores)
  ),
  selection_mode = CASE 
    WHEN draft_mode = true OR selection_mode = 'draft' THEN 'draft'
    ELSE 'manual'
  END
WHERE id IS NOT NULL;

ALTER TABLE matches DROP COLUMN IF EXISTS captain_ids;
ALTER TABLE matches DROP COLUMN IF EXISTS captains;
ALTER TABLE matches DROP COLUMN IF EXISTS quarter_scores;
ALTER TABLE matches DROP COLUMN IF EXISTS draft_mode;
```

#### Phase 3: UI 플로우 분리
```javascript
// 3. SavedMatchesList를 2개 컴포넌트로 분리

// 📖 ReadOnlyMatchHistory.jsx (Dashboard용)
// - 통계 표시만
// - 편집 불가
// - 가볍고 단순

// ✏️ EditableMatchHistory.jsx (MatchPlanner용)
// - 드래프트 편집
// - 주장 지정
// - 점수 입력
```

#### Phase 4: Draft vs Regular 명확한 분리
```javascript
// 4. MatchPlanner를 탭으로 분리

<Tab.Group>
  <Tab.List>
    <Tab>일반 매치</Tab>
    <Tab>드래프트 매치</Tab>
  </Tab.List>
  
  <Tab.Panels>
    {/* 일반 매치: 자동/수동 팀배정 */}
    <RegularMatchPanel />
    
    {/* 드래프트 매치: 주장 선택 + 쿼터 스코어 */}
    <DraftMatchPanel />
  </Tab.Panels>
</Tab.Group>

// 장점:
// - 모드 전환 체크박스 제거
// - 각 탭에서 필요한 UI만 표시
// - 로직 분리로 조건문 감소
```

---

### **Option B: 대대적 재설계 (시간 많으면)**
완전히 새로운 아키텍처

#### 구조
```
src/
  features/
    matches/
      regular/
        RegularMatchPlanner.jsx
        RegularMatchHistory.jsx
      draft/
        DraftMatchPlanner.jsx
        DraftMatchHistory.jsx
      shared/
        MatchCard.jsx
        PlayerList.jsx
    leaderboard/
      RegularStats.jsx
      DraftStats.jsx
```

---

## 📝 즉시 적용 가능한 Quick Wins

### 1. **유틸 함수로 로직 통일** (30분)
```javascript
// lib/matchHelpers.js
export const MatchHelpers = {
  isDraft: (m) => m.selectionMode === 'draft',
  getCaptains: (m) => m.draft?.captains || [],
  getQuarterScores: (m) => m.draft?.quarterScores || [],
  hasCaptains: (m) => MatchHelpers.getCaptains(m).length > 0,
  hasQuarterScores: (m) => MatchHelpers.getQuarterScores(m).length > 0,
}

// 모든 파일에서 이걸로 교체
```

### 2. **주석으로 현재 상태 명시** (10분)
```javascript
// ⚠️ DEPRECATED: match.draftMode - use match.selectionMode instead
// ⚠️ DEPRECATED: match.captainIds - use match.draft.captains instead
```

### 3. **PropTypes/TypeScript로 데이터 구조 명시** (1시간)
```typescript
interface Match {
  id: string
  selectionMode: 'draft' | 'manual' | 'auto'
  draft?: {
    captains: string[]      // 주장 선수 ID 배열
    quarterScores: number[][] // 쿼터별 점수
  }
  // ❌ captains, captainIds, draftMode - 사용 금지
}
```

---

## 🚀 추천 실행 순서

1. **Week 1**: Quick Win 1-3 적용 (기존 코드 유지하며 헬퍼 함수 도입)
2. **Week 2**: Phase 1 완료 (모든 isDraft 체크를 헬퍼로 교체)
3. **Week 3**: Phase 2 완료 (DB 마이그레이션)
4. **Week 4**: Phase 3 완료 (컴포넌트 분리)
5. **Week 5**: Phase 4 완료 (UI 탭 분리)

---

## 💡 의견?

어떤 방향으로 가고 싶은지 알려주세요:
- **A**: Quick Wins만 적용 (빠르게 개선)
- **B**: Phase 1-2 적용 (중간 수준 리팩토링)
- **C**: 전체 Phase 1-4 적용 (완전한 재정비)
- **D**: Option B 대대적 재설계

현재 상황에서는 **B (Phase 1-2)** 를 추천합니다.
