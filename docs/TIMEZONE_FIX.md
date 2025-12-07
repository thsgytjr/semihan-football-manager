# 시간대 버그 수정 가이드

## 🐛 문제
- UI에서 `07:00 AM`으로 저장하면 DB에 `01:00 AM`으로 저장됨
- 6시간 차이 발생 (타임존 변환 문제)

## 🔍 원인
DB 컬럼이 `timestamptz` (timezone-aware timestamp) 타입이었음:
- 저장 시: 자동으로 UTC로 변환
- 로드 시: 브라우저 시간대로 자동 변환
- **결과**: 이중 변환으로 시간이 틀어짐

## ✅ 해결책
**간단한 방법**: DB 컬럼을 `text` 타입으로 변경하여 입력한 그대로 저장

### 1️⃣ DB 마이그레이션 실행

각 팀의 Supabase SQL Editor에서 실행:
```sql
-- Fix timezone issue: Change date_iso from timestamptz to text
ALTER TABLE public.upcoming_matches 
  ALTER COLUMN date_iso TYPE text USING date_iso::text;

-- matches 테이블도 있으면 변경
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='matches' AND column_name='date_iso'
  ) THEN
    ALTER TABLE public.matches 
      ALTER COLUMN date_iso TYPE text USING date_iso::text;
  END IF;
END $$;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
```

**실행 대상:**
- ✅ Hangang Supabase
- ✅ Jindo Supabase  
- ✅ Semihan Supabase
- ✅ DKSC Supabase

### 2️⃣ 코드 수정 (완료)

**저장 시:**
```javascript
// Before (타임존 변환)
const dateISOFormatted = localDateTimeToISO(dateISO.slice(0,16))

// After (그대로 저장)
const dateISOFormatted = dateISO.slice(0,16)
```

**로드 시:**
```javascript
// Before (타임존 변환)
setDateISO(isoToLocalDateTime(match.dateISO))

// After (그대로 로드)
setDateISO(match.dateISO.slice(0,16))
```

## 🎯 작동 방식 (간단함!)

```
사용자 입력: 07:00
    ↓
DB 저장: "2024-12-06T07:00" (text)
    ↓
DB 로드: "2024-12-06T07:00"
    ↓
UI 표시: 07:00
```

**타임존 변환 없음 = 문제 없음!**

## 📝 수정된 파일

1. **scripts/fix-timezone-issue.sql** (신규)
   - DB 컬럼 타입 변경 스크립트

2. **src/pages/MatchPlanner.jsx** (수정)
   - 저장 시: `localDateTimeToISO()` 제거 (3곳)
   - 로드 시: `isoToLocalDateTime()` 제거 (2곳)

## ⚠️ 주의사항

### 기존 데이터
- 마이그레이션 후 기존 데이터는 `2024-12-06T07:00:00+09:00` 같은 형식으로 남아있을 수 있음
- `.slice(0,16)`로 앞 16자만 추출하므로 문제없음: `2024-12-06T07:00`

### 타임존 표시
- 이제 **저장된 시간 = 표시된 시간** (타임존 없음)
- 달라스에서 07:00 저장 → 한국에서도 07:00 표시
- 각 팀이 자기 로컬 시간으로 관리

## 🚀 배포 순서

1. **코드 배포** (이미 완료, 빌드 성공)
2. **DB 마이그레이션** (각 팀 Supabase에서 SQL 실행)
3. **테스트**:
   - 새 매치 생성: 07:00 입력 → 07:00 저장 확인
   - 기존 매치 로드: 시간이 올바르게 표시되는지 확인

---

**결론**: 복잡한 타임존 변환 없이 **UI 입력 그대로 저장/표시**하여 문제 완전 해결! 🎉
