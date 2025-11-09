# 데이터베이스 구조 비교: Semihan DB vs DKSC DB

## 📋 개요

- 과거: Semihan은 `src/lib/matches.service.js`(user_id 기반), DKSC는 `src/services/matches.service.js`(room_id 기반)
- 현재: 코드 기준 정석은 `src/services/matches.service.js`이며, `src/lib/matches.service.js`는 동일 API를 재출력하는 호환(shim)
- 권장: 모든 프로젝트 DB에 `room_id` 컬럼 추가 후 ROOM 스코프로 통일 (예: `${TEAM_SHORT}-lite-room-1`)

---

## ⚠️ 중요한 차이점

### 1. 인증 방식
| Semihan DB | DKSC DB |
|------------|---------|
| `user_id` (개인 사용자) | `room_id` (팀/방 공유) |

### 2. 컬럼 이름 규칙
| 필드 | Semihan DB | DKSC DB | 상태 |
|------|-----------|---------|------|
| 날짜 | `date_iso` | `dateISO` | ⚠️ **다름** |
| 참석자 | `attendee_ids` | `attendeeIds` | ⚠️ **다름** |
| 팀 수 | `team_count` | `teamCount` | ⚠️ **다름** |
| 선택 모드 | `selection_mode` | `selectionMode` | ⚠️ **다름** |
| 기준 | `criterion` | `criterion` | ✅ 같음 |
| 위치 | `location` | `location` | ✅ 같음 |
| 모드 | `mode` | `mode` | ✅ 같음 |
| 스냅샷 | `snapshot` | `snapshot` | ✅ 같음 |
| 보드 | `board` | `board` | ✅ 같음 |
| 포메이션 | `formations` | `formations` | ✅ 같음 |
| 잠금 | `locked` | `locked` | ✅ 같음 |
| 비디오 | `videos` | `videos` | ✅ 같음 |
| 팀 색상 | ❌ 없음 | `teamColors` | ⚠️ **DKSC만** |
| 통계 | ❌ 없음 | `stats` | ⚠️ **DKSC만** |
| 드래프트 | ❌ 없음 | `draft` | ⚠️ **DKSC만** |
| 팀 IDs | ❌ 없음 | `teamids` | ⚠️ **DKSC만** |

---

## 🔧 DKSC DB의 호환성 처리

### toAppFormat() 함수의 Fallback 로직
DKSC의 `toAppFormat()` 함수는 **양쪽 컬럼명을 모두 지원**합니다:

```javascript
dateISO: row.dateISO || row.date_iso,        // camelCase 우선, snake_case 대체
attendeeIds: row.attendeeIds || row.attendee_ids || [],
teamCount: row.teamCount || row.team_count || 2,
selectionMode: row.selectionMode || row.selection_mode || 'manual',
teamColors: row.teamColors || row.team_colors || null,
```

### toDbFormat() 함수는 camelCase만 사용
```javascript
dateISO: match.dateISO ?? null,              // camelCase로 저장
attendeeIds: match.attendeeIds ?? [],
teamCount: match.teamCount ?? 2,
selectionMode: match.selectionMode ?? 'manual',
teamColors: match.teamColors ?? null,
```

---

## ✅ DKSC 마이그레이션 완료 상태

### 추가된 컬럼들 (dksc-complete-migration.sql 실행 후)
- ✅ `room_id` TEXT (기본값: 'DKSC-lite-room-1')
- ✅ `attendeeIds` JSONB
- ✅ `dateISO` TIMESTAMP
- ✅ `criterion` TEXT
- ✅ `teamCount` INTEGER
- ✅ `location` TEXT
- ✅ `mode` TEXT
- ✅ `board` JSONB
- ✅ `formations` JSONB
- ✅ `selectionMode` TEXT
- ✅ `locked` BOOLEAN
- ✅ `videos` JSONB
- ✅ `teamids` JSONB
- ✅ `draft` JSONB
- ✅ `teamColors` JSONB
- ✅ `updated_at` TIMESTAMP

### 기존 컬럼들 (원래 있던 것)
- ✅ `id` UUID
- ✅ `date` TIMESTAMP (nullable로 변경됨)
- ✅ `selection_mode` TEXT
- ✅ `attendee_ids` JSONB
- ✅ `snapshot` JSONB
- ✅ `quarter_scores` JSONB
- ✅ `stats` JSONB
- ✅ `is_draft_complete` BOOLEAN
- ✅ `created_at` TIMESTAMP

---

## 🎯 결론

### ✅ 호환성 상태: **완전 호환**

1. **DKSC DB는 양쪽 컬럼명을 모두 가지고 있음**
   - 기존: `date`, `selection_mode`, `attendee_ids` (snake_case)
   - 추가: `dateISO`, `selectionMode`, `attendeeIds` (camelCase)

2. **코드는 camelCase 컬럼을 우선 사용**
   - `toAppFormat()`에서 fallback 로직으로 snake_case도 읽을 수 있음
   - `toDbFormat()`는 camelCase 컬럼에만 저장

3. **Semihan DB도 업그레이드 가능**
   - Semihan DB에도 동일한 마이그레이션을 실행하면 DKSC와 동일한 구조가 됨
   - 기존 snake_case 컬럼은 유지되고, camelCase 컬럼이 추가됨

---

## 📝 권장 사항

### Semihan DB 마이그레이션 (선택사항)
Semihan DB도 DKSC와 동일하게 만들려면:

1. `scripts/dksc-complete-migration.sql` 실행
2. `user_id` 컬럼은 그대로 유지 (room_id 대신)
3. 나머지 컬럼들은 DKSC와 동일하게 추가

### 코드 통합 (적용됨)
현재 정석 서비스는 `src/services/matches.service.js` 하나이며,
`src/lib/matches.service.js`는 동일 API 이름으로 재출력(shim)하여 기존 import도 안전하게 동작합니다.
DB 스코프는 `room_id` 사용을 권장하며, Semihan DB에는 `scripts/semihan-add-roomid.sql`로 추가할 수 있습니다.

---

## 🐛 알려진 이슈

### videos 컬럼 JSON 파싱
- **문제**: JSONB 배열에 저장된 객체가 문자열로 변환됨
- **해결**: `toAppFormat()`에서 JSON 파싱 로직 추가됨 ✅
  ```javascript
  videos = videos.map(v => {
    if (typeof v === 'string') {
      try { return JSON.parse(v) }
      catch { return v }
    }
    return v
  })
  ```

### date 컬럼 NOT NULL 제약
- **문제**: DKSC에서 `date` 컬럼이 NOT NULL이었으나 코드는 `dateISO`만 사용
- **해결**: `date` 컬럼 nullable로 변경됨 ✅
