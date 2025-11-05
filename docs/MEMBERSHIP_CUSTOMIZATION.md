# 멤버십 커스터마이징 기능 가이드

## 📋 개요
팀별로 다른 멤버십 규칙을 적용할 수 있도록 멤버십을 자유롭게 추가/수정/삭제할 수 있는 기능입니다.

## ✨ 주요 기능

### 1. 멤버십 설정 관리
- **위치**: 선수 관리 페이지 → "멤버십 설정" 버튼 (Admin만 접근 가능)
- **기능**:
  - 새 멤버십 추가
  - 기존 멤버십 수정 (이름, 배지, 색상)
  - 멤버십 삭제 (사용 중인 선수가 없을 때만)

### 2. 커스텀 배지
- **배지 텍스트**: 1글자까지 입력 가능 (예: "준", "G", "T")
- **배지 없음**: 정회원처럼 배지 없이 설정 가능
- **배지 색상**: 9가지 색상 중 선택
  - 🔴 빨강 (red)
  - 🟠 오렌지 (orange)
  - 🟡 노란색 (amber)
  - 🟢 초록색 (emerald)
  - 🔵 파란색 (blue)
  - 🟣 보라색 (purple)
  - 🌸 핑크 (pink)
  - 🌹 장미색 (rose)
  - 🪨 회색 (stone)

### 3. 기본 멤버십
- **정회원**: 배지 없음, 초록색 테마
- **준회원**: "준" 배지, 노란색 테마
- **게스트**: "G" 배지, 빨간색 테마

기본 멤버십도 수정/삭제 가능합니다.

## 🔧 기술 구조

### 데이터 저장
```javascript
// appdb.data.membershipSettings (JSONB Array)
[
  {
    "id": "member",
    "name": "정회원",
    "badge": null,
    "color": "emerald",
    "deletable": true
  },
  {
    "id": "associate",
    "name": "준회원",
    "badge": "준",
    "badgeColor": "amber",
    "deletable": true
  },
  {
    "id": "guest",
    "name": "게스트",
    "badge": "G",
    "badgeColor": "rose",
    "deletable": true
  }
]
```

### 주요 파일

#### 1. `src/lib/membershipConfig.js`
멤버십 설정 중앙 관리 라이브러리

**주요 함수**:
- `DEFAULT_MEMBERSHIPS`: 기본 3개 멤버십 정의
- `BADGE_COLORS`: 9가지 배지 색상 팔레트
- `getMembershipBadge(membership, customMemberships)`: 멤버십 이름으로 배지 정보 조회
- `getBadgeColorStyle(colorName)`: 색상 이름으로 RGB 스타일 조회
- `validateMembership(membership)`: 멤버십 유효성 검사
- `canDeleteMembership(membershipId, players)`: 안전 삭제 체크

#### 2. `src/components/MembershipSettings.jsx`
멤버십 설정 UI 컴포넌트

**기능**:
- 멤버십 추가/수정/삭제 폼
- 배지 실시간 미리보기
- 안전 삭제 (사용 중인 선수 카운트 표시)
- 1글자 배지 입력 제한

#### 3. `src/services/storage.service.js`
멤버십 설정 CRUD

**함수**:
- `loadMembershipSettings()`: Supabase에서 멤버십 설정 로드
- `saveMembershipSettings(membershipSettings)`: 멤버십 설정 저장

#### 4. `src/components/InitialAvatar.jsx`
아바타 배지 렌더링

**변경 사항**:
- `customMemberships` prop 추가
- `getMembershipBadge()` 사용하여 커스텀 배지 색상 적용
- 하드코딩 폴백 유지 (하위 호환성)

#### 5. `src/pages/PlayersPage.jsx`
선수 관리 페이지

**변경 사항**:
- "멤버십 설정" 버튼 추가 (Admin 전용)
- `MembershipSettings` 모달 통합
- `EditPlayerModal`에서 동적 멤버십 선택 UI
- 모든 `InitialAvatar`에 `customMemberships` 전달

## 📊 데이터베이스 마이그레이션

### Supabase 쿼리
```sql
-- 1. membershipSettings 필드 추가
UPDATE appdb 
SET data = data || '{"membershipSettings":[]}'::jsonb 
WHERE data->>'membershipSettings' IS NULL;

-- 2. (선택사항) 기본 멤버십으로 초기화
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
```

**실행 순서**:
1. Supabase SQL Editor에서 쿼리 1번 실행
2. (선택) 기본 멤버십 설정하려면 쿼리 2번 실행
3. 앱 새로고침

## 🔒 안전 장치

### 1. 삭제 방지
- 사용 중인 선수가 있는 멤버십은 삭제 불가
- 삭제 시도 시 사용 중인 선수 수 표시

### 2. 하위 호환성
- 커스텀 멤버십 없을 때 기본값 사용
- 기존 선수 데이터 자동 매핑
- `DEFAULT_MEMBERSHIPS` 폴백

### 3. 유효성 검사
- 배지 텍스트 1글자 제한
- 멤버십 이름 필수
- 중복 ID 방지

## 🎯 사용 시나리오

### 시나리오 1: 트레이너 멤버십 추가
```
1. 선수 관리 → "멤버십 설정" 클릭
2. "새 멤버십 추가" 클릭
3. 멤버십 이름: "트레이너"
4. 배지 텍스트: "T"
5. 배지 색상: 파란색 선택
6. "추가" 클릭
7. 선수 추가/수정 시 "트레이너" 선택 가능
```

### 시나리오 2: 게스트 멤버십 수정
```
1. 선수 관리 → "멤버십 설정" 클릭
2. "게스트" 행의 "수정" 클릭
3. 배지 텍스트: "손님" 으로 변경
4. 배지 색상: 오렌지로 변경
5. "저장" 클릭
6. 모든 게스트 선수 배지 자동 업데이트
```

### 시나리오 3: 사용하지 않는 멤버십 삭제
```
1. 선수 관리 → "멤버십 설정" 클릭
2. 삭제하려는 멤버십 행의 "삭제" 클릭
3. 사용 중인 선수가 없으면 즉시 삭제
4. 사용 중인 선수가 있으면 경고 메시지 표시
```

## 🐛 알려진 제한사항

1. **배지 길이**: 1글자만 지원 (UI 가독성 유지)
2. **색상 옵션**: 9가지로 제한 (색상 일관성 유지)
3. **배지 개수**: 아바타당 최대 3개 (UI 공간 제약)

## 🔄 다음 단계

현재 `PlayersPage`에만 적용된 상태입니다. 다른 페이지에도 적용하려면:

1. **MatchPlanner.jsx**: 
   - App.jsx에서 `membershipSettings` props 전달
   - `InitialAvatar`에 `customMemberships` 전달

2. **Dashboard.jsx**:
   - App.jsx에서 `membershipSettings` props 전달
   - `InitialAvatar`에 `customMemberships` 전달

3. **DraftPage.jsx**:
   - App.jsx에서 `membershipSettings` props 전달
   - `InitialAvatar`에 `customMemberships` 전달

4. **다른 모든 페이지**:
   - `InitialAvatar` 사용하는 곳에 `customMemberships` props 추가

## 💡 팁

- 멤버십 이름은 한글로 저장되므로 기존 선수 데이터와 호환됩니다
- 배지 미리보기를 보면서 색상 선택 가능
- 삭제 전 사용 중인 선수 수를 확인하세요
- Admin 계정만 설정 변경 가능 (팀장/관리자 전용)
