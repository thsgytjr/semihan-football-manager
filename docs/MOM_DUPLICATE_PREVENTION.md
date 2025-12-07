# MOM 투표 중복 방지 개선 가이드

## 문제점
IP 해시 + Visitor ID 조합을 모두 인덱스에 걸어두다 보니, **같은 디바이스가 네트워크만 바꾸면 다른 레코드**로 인식되어 중복 투표를 막지 못했습니다.

## 해결 방안
디바이스 Fingerprint에서 생성한 Visitor ID를 **단일 식별자**로 사용하고, DB에서도 `match_id + visitor_id` 조합이 무조건 유일하도록 강제했습니다. IP 해시는 Visitor ID를 구할 수 없을 때만 보조 수단으로 남겨두었습니다.

### 변경 사항

#### 1. 디바이스 Fingerprint 생성 (`src/lib/deviceFingerprint.js`)
- User Agent, 화면 해상도, 타임존, 언어, CPU 코어 수, Touch 지원 등 10가지 요소 조합
- Web Crypto API로 SHA-256 해시 생성
- LocalStorage에 시드 저장해서 같은 브라우저는 항상 같은 fingerprint

#### 2. DB 제약 조건 개선
**이전:**
```sql
-- IP만 체크 (같은 와이파이 = 1명만 투표)
create unique index mom_votes_unique_ip on mom_votes(match_id, ip_hash);
```

**개선:**
```sql
-- Visitor ID가 있는 순간 네트워크가 달라도 1회만 인정
create unique index mom_votes_unique_visitor on mom_votes(match_id, visitor_id)
   where visitor_id is not null;

-- Visitor ID가 비어 있는 레거시 데이터만 IP로 체크
create unique index mom_votes_unique_ip_fallback on mom_votes(match_id, ip_hash)
   where visitor_id is null and ip_hash is not null;
```

#### 3. 중복 체크 로직 개선 (`src/hooks/useMoMPrompt.js`)
**이전:**
```javascript
// IP 또는 Visitor ID가 일치하면 중복
const hasVote = votes.some(v => {
  const ipMatch = ipHash && v.ipHash && v.ipHash === ipHash
  const visitorMatch = visitorId && v.visitorId && v.visitorId === visitorId
  return ipMatch || visitorMatch  // ❌ OR 조건
})
```

**개선:**
```javascript
// Visitor ID가 최우선, 없을 때만 IP fallback
const hasVote = votes.some(v => {
   if (visitorId && v.visitorId) {
      return v.visitorId === visitorId
   }
   if (!visitorId && ipHash && v.ipHash && !v.visitorId) {
      return v.ipHash === ipHash
   }
   return false
})
```

### 마이그레이션 방법

#### 1단계: DB 제약 조건 마이그레이션
Supabase SQL Editor에서 실행:
```bash
scripts/migrate-mom-votes-unique-constraint.sql
```

이 스크립트는:
- 기존 `mom_votes_unique_device`, `mom_votes_unique_ip_only`, `mom_votes_unique_visitor_only` 인덱스 정리
- `match_id + visitor_id`를 강제하는 `mom_votes_unique_visitor` 생성
- Visitor ID가 비어 있을 때만 동작하는 `mom_votes_unique_ip_fallback` 생성

#### 2단계: 코드 배포
변경된 파일들:
- `src/lib/deviceFingerprint.js` (신규)
- `src/hooks/useMoMPrompt.js` (개선된 fingerprint 사용)
- `src/services/momVotes.service.js` (에러 메시지 개선)
- `src/i18n/locales/en.json`, `ko.json` (에러 메시지 업데이트)

#### 3단계: 확인
1. 같은 와이파이에 연결된 2개 이상의 디바이스로 테스트
2. 각 디바이스에서 MOM 투표가 정상적으로 되는지 확인
3. 같은 디바이스에서 다시 투표 시도 → "이미 투표했습니다" 메시지 확인

### 기술 세부사항

#### Fingerprint 구성 요소
1. **User Agent**: 브라우저 종류, 버전
2. **화면 해상도**: `${width}x${height}` + 색상 깊이
3. **타임존**: 사용자 지역
4. **언어 설정**: 브라우저 언어
5. **플랫폼**: OS 정보
6. **CPU 코어 수**: 하드웨어 정보
7. **Touch 지원**: 모바일/태블릿 구분
8. **Canvas Fingerprint**: 브라우저별 렌더링 차이
9. **LocalStorage 지원**: 스토리지 가용성
10. **랜덤 시드**: 초기 생성 시 1회 생성 후 localStorage에 영구 저장

#### 레거시 호환성
기존 투표 데이터와의 호환성을 위해:
- Visitor ID가 있는 경우 → `match_id + visitor_id` 하나만 확인 (IP는 무시)
- Visitor ID가 비어 있는 구 레코드 → `match_id + ip_hash`로 1회만 허용

### 시나리오별 동작

#### ✅ 허용되는 경우
1. **같은 와이파이, 다른 디바이스**
   - 선수 A (아이폰) → IP: 1.2.3.4, Visitor: abc123
   - 선수 B (갤럭시) → IP: 1.2.3.4, Visitor: def456
   - 결과: 둘 다 투표 가능 ✅ (Visitor ID가 다르기 때문)

#### ❌ 차단되는 경우
1. **같은 디바이스, 네트워크만 변경**
   - 선수 A (집 와이파이) → IP: 1.2.3.4, Visitor: abc123
   - 선수 A (LTE) → IP: 5.6.7.8, Visitor: abc123
   - 결과: 두 번째 투표 시도 즉시 ❌
2. **브라우저 탭/창을 여러 개 띄우고 재투표**
   - 첫 번째 제출 후 모든 추가 투표 ❌ (동일 Visitor ID)

### 보안 고려사항

#### 우회 가능성
1. **브라우저 시크릿 모드**: LocalStorage 캐시가 비어도 Fingerprint는 동일하게 계산되므로 차단됩니다. (일부 브라우저가 Canvas 정보를 무작위화하면 실패할 수 있으나 극히 드묾)

2. **브라우저 변경**: 같은 디바이스라도 Chrome ↔ Safari처럼 다른 엔진을 쓰면 Fingerprint가 달라질 수 있습니다. 현실적인 범위에서는 허용(다른 디바이스로 간주)합니다.

3. **디바이스 초기화**: 공장 초기화 후에는 완전히 새 Fingerprint가 생성됩니다. 현실적으로 MOM 1표를 위해 초기화할 가능성은 낮다고 판단합니다.

#### 권장 사항
- MOM 투표는 "재미" 목적이므로 완벽한 방지보다는 **합리적인 수준**의 중복 차단이 목표
- 악의적 우회는 어렵게 만들되, 일반 사용자는 편하게 투표할 수 있도록

### 모니터링

투표 패턴 이상 감지:
```sql
-- 같은 IP에서 여러 Visitor ID로 투표한 경우 조회
select 
  ip_hash, 
  count(distinct visitor_id) as device_count,
  array_agg(distinct voter_label) as voters
from mom_votes
where match_id = '<매치ID>'
group by ip_hash
having count(distinct visitor_id) > 5  -- 5대 이상 의심스러움
order by device_count desc;
```

### FAQ

**Q: 브라우저를 바꾸면 다시 투표할 수 있나요?**
A: 브라우저 엔진이 바뀌면 Fingerprint도 달라질 수 있어, 현실적으로는 "다른 디바이스"로 취급됩니다. 운영 정책상 1인 다중 브라우저 투표는 수동 모니터링 대상입니다.

**Q: 시크릿 모드로 우회 가능한가요?**
A: 대부분의 브라우저에서 Fingerprint 계산은 동일하므로 차단됩니다. 다만 Canvas 데이터를 매 세션 랜덤화하는 브라우저가 있다면 우회 가능성이 있어, 이상 패턴 모니터링으로 보완합니다.

**Q: 기존 투표 데이터는 어떻게 되나요?**
A: 기존 데이터는 그대로 유지되며, 레거시 호환성 인덱스가 있어서 문제없습니다.

**Q: 성능 영향은 없나요?**
A: Fingerprint 생성은 ~10ms 이하로 매우 빠르며, 한 번만 생성 후 LocalStorage에 캐싱됩니다.

### 문제 해결

**증상: "Already voted" 에러가 계속 나타남**
1. 브라우저 LocalStorage 확인: `sfm_visitor_id_v3` 키 존재 확인
2. 콘솔에서 Fingerprint 확인: `localStorage.getItem('sfm_visitor_id_v3')`
3. IP 해시 확인: 네트워크 탭에서 API 요청 payload 확인

**증상: 같은 디바이스가 네트워크만 바꾸고 다시 투표하려고 함**
1. 기대 동작: "이미 투표했습니다" 에러 발생
2. 만약 통과했다면 DB에서 `match_id`, `visitor_id`가 중복인지 확인하고, Fingerprint 계산 로직이 fallback ID를 반환하지 않았는지 점검

### 참고 자료
- [FingerprintJS Documentation](https://github.com/fingerprintjs/fingerprintjs)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
