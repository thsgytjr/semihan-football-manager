# 안정성 향상 가이드

## ✅ 완료된 작업

### 1. Sentry 에러 모니터링 설정
- **파일**: `src/lib/sentry.js`
- **기능**: 프로덕션 환경에서 발생하는 모든 에러를 자동으로 추적
- **설정 필요**: 

```bash
# .env 파일에 추가
VITE_SENTRY_DSN=your_sentry_dsn_here
```

**Sentry 설정 방법**:
1. https://sentry.io 회원가입
2. 새 프로젝트 생성 (React 선택)
3. DSN 복사 (Settings > Projects > [프로젝트명] > Client Keys)
4. `.env` 파일에 붙여넣기

### 2. 에러 바운더리 (Error Boundary)
- **파일**: `src/components/ErrorBoundary.jsx`
- **기능**: 컴포넌트 에러 발생 시 앱 전체가 죽지 않고 에러 UI 표시
- **적용됨**:
  - ✅ Dashboard
  - ✅ PlayersPage
  - ✅ MatchPlanner
  - ✅ DraftPage
  - ✅ FormationBoard
  - ✅ StatsInput
  - ✅ AccountingPage
  - ✅ AnalyticsPage
  - ✅ RefereeMode

### 3. 입력 검증 유틸리티
- **파일**: `src/lib/validation.js`
- **제공 함수**:
  - `validateRequired()` - 필수 입력 검증
  - `validateLength()` - 문자열 길이 검증
  - `validateEmail()` - 이메일 형식 검증
  - `validatePhoneNumber()` - 전화번호 검증
  - `validateNumber()` - 숫자 범위 검증
  - `validateDate()` - 날짜 검증
  - `validateArray()` - 배열 검증
  - `validatePlayer()` - 플레이어 데이터 검증
  - `validateMatch()` - 매치 데이터 검증
  - `sanitizeString()` - 안전한 문자열 변환
  - `sanitizeNumber()` - 안전한 숫자 변환

**사용 예시**:
```javascript
import { validatePlayer, validateEmail } from './lib/validation'

// 플레이어 데이터 검증
const result = validatePlayer(playerData)
if (!result.valid) {
  alert(result.error) // "이름은 필수입니다."
  return
}

// 이메일 검증
const emailResult = validateEmail(email)
if (!emailResult.valid) {
  alert(emailResult.error) // "올바른 이메일 형식이 아닙니다."
}
```

### 4. PropTypes (prop-types 패키지 설치됨)
- **패키지**: `prop-types`
- **설치됨**: ✅
- **사용법**:

```javascript
import PropTypes from 'prop-types'

function MyComponent({ name, age, onSave }) {
  // ...
}

MyComponent.propTypes = {
  name: PropTypes.string.isRequired,
  age: PropTypes.number,
  onSave: PropTypes.func.isRequired,
}
```

### 5. 테스트 수정
- **StatsInput 테스트**: ✅ 모두 통과 (5/5)
  - Bulk 입력 검증
  - goal:assist 링크 유지
  - 연결된 골/어시스트 제거

---

## 📊 테스트 현황

```
✅ StatsInput: 5/5 통과
❌ RefereeMode: 0/11 통과 (수정 필요)
❌ Dashboard: 0/40 통과 (수정 필요)
❌ AccountingPage: 3/4 통과 (1개 수정 필요)
✅ 기타: 27개 유틸리티 테스트 통과
```

---

## 🎯 향후 개선 사항

### 우선순위 1: 즉시 적용 가능
1. **Sentry DSN 설정** - 프로덕션 에러 추적 활성화
2. **주요 폼에 입력 검증 적용** - validation.js 사용
3. **PropTypes 추가** - 주요 컴포넌트에 타입 검증

### 우선순위 2: 안정성 강화
4. **나머지 테스트 수정** - RefereeMode, Dashboard
5. **로딩 상태 통일** - Suspense + ErrorBoundary
6. **에러 로깅 강화** - sentry.js 활용

### 우선순위 3: 고급 기능
7. **E2E 테스트 추가** - Playwright/Cypress
8. **성능 모니터링** - React Profiler
9. **타입스크립트 마이그레이션** 검토

---

## 🚀 즉시 사용 가능한 기능

### 에러 추적하기
```javascript
import { logError, logMessage } from './lib/sentry'

try {
  // 위험한 작업
  riskyOperation()
} catch (error) {
  logError(error, {
    tags: { component: 'MyComponent' },
    extra: { userId, matchId }
  })
}
```

### 입력 검증하기
```javascript
import { validateAll, validateRequired, validateEmail } from './lib/validation'

function handleSubmit(formData) {
  const validation = validateAll([
    validateRequired(formData.name, '이름'),
    validateEmail(formData.email),
    validateNumber(formData.age, 1, 150, '나이')
  ])
  
  if (!validation.valid) {
    alert(validation.error)
    return
  }
  
  // 검증 통과, 저장 진행
  saveData(formData)
}
```

### 에러 바운더리 커스터마이징
```javascript
<ErrorBoundary 
  componentName="중요한 페이지"
  resetable={false}  // 다시 시도 버튼 숨기기
  fallback={({ error, reset }) => (
    <div>
      <h1>문제가 발생했습니다</h1>
      <p>{error.message}</p>
      <button onClick={reset}>다시 시도</button>
    </div>
  )}
>
  <MyImportantComponent />
</ErrorBoundary>
```

---

## 📈 기대 효과

1. **에러 감소**: 입력 검증으로 잘못된 데이터 차단
2. **빠른 대응**: Sentry로 실시간 에러 파악
3. **앱 안정성**: ErrorBoundary로 부분 오류 격리
4. **개발 효율**: PropTypes로 타입 에러 사전 발견
5. **사용자 경험**: 에러 발생 시에도 앱이 죽지 않음

---

## 🔧 문제 발생 시

### Sentry가 작동하지 않는 경우
1. `.env` 파일에 `VITE_SENTRY_DSN` 확인
2. 프로덕션 빌드인지 확인 (`npm run build` 후 테스트)
3. Sentry 프로젝트 설정에서 DSN 재확인

### 에러 바운더리가 표시되지 않는 경우
1. ErrorBoundary가 컴포넌트를 감싸고 있는지 확인
2. 브라우저 콘솔에서 에러 메시지 확인
3. 개발 모드에서는 에러 상세 정보 표시됨

### 테스트 실패 시
```bash
# 특정 테스트만 실행
npm test -- src/pages/__tests__/StatsInput.test.jsx --run

# UI 모드로 실행 (디버깅용)
npm run test:ui
```

---

**작성일**: 2025-12-25
**버전**: 7.4.4+
