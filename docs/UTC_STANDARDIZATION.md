# UTC 표준화 가이드

## 🌍 개요
앱의 모든 날짜/시간을 UTC 기준으로 표준화하여 한국, 미국 등 어느 지역에서든 버그 없이 사용 가능하도록 개선했습니다.

## ✅ 작동 원리

### 저장 (Save)
```
사용자 입력: 2025-12-23 19:00 (로컬)
    ↓ localDateTimeToUTC()
UTC 변환: 2025-12-23T10:00:00.000Z
    ↓
DB 저장: "2025-12-23T10:00:00.000Z"
```

### 표시 (Display)
```
DB 로드: "2025-12-23T10:00:00.000Z"
    ↓ utcToLocalDateTime()
로컬 변환: 2025-12-23 19:00 (한국)
         2025-12-23 05:00 (미국 동부)
    ↓
UI 표시: 사용자의 로컬 시간
```

### 비교 (Compare)
```javascript
// 모든 시간 비교는 UTC 기준
const now = new Date()  // 자동으로 UTC 처리
const matchTime = new Date(utcIsoString)  // UTC 파싱
return now > matchTime  // 정확한 비교
```

## 🔧 주요 함수

### 1. `localDateTimeToUTC(localString)`
로컬 시간(`YYYY-MM-DDTHH:mm`)을 UTC ISO(`YYYY-MM-DDTHH:mm:ss.sssZ`)로 변환

```javascript
import { localDateTimeToUTC } from './lib/dateUtils'

// 한국(UTC+9)에서
const utc = localDateTimeToUTC('2025-12-23T19:00')
// → "2025-12-23T10:00:00.000Z"

// 미국 동부(UTC-5)에서
const utc = localDateTimeToUTC('2025-12-23T05:00')
// → "2025-12-23T10:00:00.000Z"

// 같은 UTC 시간!
```

### 2. `utcToLocalDateTime(utcString)`
UTC ISO를 로컬 시간(`YYYY-MM-DDTHH:mm`)으로 변환

```javascript
import { utcToLocalDateTime } from './lib/dateUtils'

const utc = "2025-12-23T10:00:00.000Z"

// 한국(UTC+9)에서
const local = utcToLocalDateTime(utc)
// → "2025-12-23T19:00"

// 미국 동부(UTC-5)에서
const local = utcToLocalDateTime(utc)
// → "2025-12-23T05:00"
```

### 3. `formatUTCToLocal(utcString, locale, options)`
UTC를 로케일에 맞게 포맷팅

```javascript
import { formatUTCToLocal } from './lib/dateUtils'

const utc = "2025-12-23T10:00:00.000Z"

// 한국어
formatUTCToLocal(utc, 'ko-KR')
// → "2025년 12월 23일 오후 7:00"

// 영어
formatUTCToLocal(utc, 'en-US')
// → "December 23, 2025 at 7:00 PM"
```

## 📝 수정된 파일

### 1. `src/lib/dateUtils.js` ⭐️ 핵심
- `localDateTimeToUTC()` - 로컬 → UTC 변환
- `utcToLocalDateTime()` - UTC → 로컬 변환
- `formatUTCToLocal()` - UTC → 포맷팅
- `compareUTC()` - UTC 비교
- 하위 호환성을 위한 alias 제공

### 2. `src/pages/MatchPlanner.jsx`
**저장 시 (3곳):**
```javascript
// Before
const dateISOFormatted = localDateTimeToISO(dateISO.slice(0,16))

// After
const dateISOFormatted = localDateTimeToUTC(dateISO.slice(0,16))
```

**로드 시 (2곳):**
```javascript
// Before
if(dateStr.includes('Z') || dateStr.includes('+')) {
  const d = new Date(dateStr)
  const local = `${d.getFullYear()}-...`  // 수동 변환
  setDateISO(local)
}

// After
const localTime = utcToLocalDateTime(dateStr)  // 간단!
setDateISO(localTime)
```

### 3. `src/App.jsx`
**Import 변경:**
```javascript
// Before
import { localDateTimeToISO } from './lib/dateUtils'

// After
import { localDateTimeToUTC } from './lib/dateUtils'
```

**normalizeMatchDateISO 함수 (2곳):**
```javascript
// Before
return localDateTimeToISO(trimmed)

// After
return localDateTimeToUTC(trimmed)
```

## 🎯 테스트 시나리오

### 시나리오 1: 한국에서 매치 생성
```
1. 한국(UTC+9)에서 로그인
2. 매치 시간: 2025-12-24 18:00 입력
3. 저장
4. DB 확인: "2025-12-24T09:00:00.000Z" ✅
```

### 시나리오 2: 미국에서 같은 매치 확인
```
1. 미국 동부(UTC-5)에서 로그인
2. 같은 매치 로드
3. UI 표시: 2025-12-24 04:00 ✅
4. 실제로는 같은 시간!
```

### 시나리오 3: 만료 체크
```
UTC 기준 비교:
- 현재: 2025-12-24T10:00:00.000Z
- 매치: 2025-12-24T09:00:00.000Z
- 결과: 만료됨 ✅

어느 지역에서든 동일한 결과!
```

## ⚠️ 마이그레이션 참고

### 기존 데이터
- 이미 UTC로 저장된 데이터(`...Z`, `...+09:00`): 변경 불필요 ✅
- 로컬 시간으로 저장된 데이터(`YYYY-MM-DDTHH:mm`): 자동으로 UTC로 해석됨

### DB 스키마
- **권장**: `text` 타입 유지 (유연성)
- **대안**: `timestamptz` 사용 시 Postgres가 자동 UTC 변환

### 점진적 전환
1. 신규 데이터는 자동으로 UTC 저장
2. 기존 데이터는 읽을 때 UTC로 파싱
3. 편집 후 재저장 시 UTC로 정규화

## 🚀 배포 체크리스트

- [x] 코드 변경 완료
- [x] 빌드 성공 확인
- [x] 로컬 테스트 (한국 시간)
- [ ] 프로덕션 배포
- [ ] 다른 타임존에서 테스트 (선택)
- [ ] 기존 데이터 정상 로드 확인

## 🌟 장점

1. **글로벌 호환성**: 한국, 미국, 유럽 어디서든 동일하게 작동
2. **정확한 비교**: 시간대 차이 없이 정확한 만료/스케줄 체크
3. **간단한 코드**: 복잡한 타임존 로직 불필요
4. **표준 준수**: ISO 8601 UTC 표준 사용
5. **디버깅 용이**: UTC는 불변이므로 로그 분석 쉬움

## 📚 참고 자료

- [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) - 국제 날짜/시간 표준
- [MDN: Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)

---

**결론**: 모든 시간은 UTC로 저장하고, 표시할 때만 로컬 변환! 🌍⏰
