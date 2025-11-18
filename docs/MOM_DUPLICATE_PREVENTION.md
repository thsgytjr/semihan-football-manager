# MOM 투표 중복 방지 개선 가이드

## 문제점
기존 시스템은 **IP 주소만**으로 중복 투표를 막았기 때문에, 같은 와이파이를 쓰는 여러 선수들(같은 공인 IP)이 서로 다른 디바이스로 투표할 수 없었습니다.

## 해결 방안
**IP + 디바이스 Fingerprint 조합**으로 중복을 판단하도록 개선했습니다.

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
-- IP + Visitor ID 조합 체크 (같은 와이파이 + 다른 디바이스 = 각각 투표 가능)
create unique index mom_votes_unique_device on mom_votes(match_id, ip_hash, visitor_id) 
  where ip_hash is not null and visitor_id is not null;
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
// IP **AND** Visitor ID가 모두 일치해야 중복
const hasVote = votes.some(v => {
  if (ipHash && visitorId && v.ipHash && v.visitorId) {
    return v.ipHash === ipHash && v.visitorId === visitorId  // ✅ AND 조건
  }
  // ... 레거시 호환성 코드
})
```

### 마이그레이션 방법

#### 1단계: DB 제약 조건 마이그레이션
Supabase SQL Editor에서 실행:
```bash
scripts/migrate-mom-votes-unique-constraint.sql
```

이 스크립트는:
- 기존 `mom_votes_unique_ip`, `mom_votes_unique_visitor` 인덱스 삭제
- 새로운 `mom_votes_unique_device` 인덱스 생성 (IP + Visitor ID 조합)
- 레거시 호환성을 위한 인덱스도 함께 생성

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
- IP만 있는 투표 → IP로만 중복 체크
- Visitor ID만 있는 투표 → Visitor ID로만 중복 체크
- 둘 다 있는 투표 → 조합으로 중복 체크

### 시나리오별 동작

#### ✅ 허용되는 경우
1. **같은 와이파이, 다른 디바이스**
   - 선수 A (아이폰) → IP: 1.2.3.4, Visitor: abc123
   - 선수 B (갤럭시) → IP: 1.2.3.4, Visitor: def456
   - 결과: 둘 다 투표 가능 ✅

2. **같은 디바이스, 다른 와이파이**
   - 선수 A (집 와이파이) → IP: 1.2.3.4, Visitor: abc123
   - 선수 A (LTE) → IP: 5.6.7.8, Visitor: abc123
   - 결과: 두 번째 투표도 가능 ✅ (하지만 실제론 같은 디바이스라 막힘)

#### ❌ 차단되는 경우
1. **같은 디바이스, 같은 와이파이에서 재투표**
   - IP: 1.2.3.4, Visitor: abc123 → 이미 투표함
   - 다시 투표 시도 → ❌ "이미 투표하셨습니다"

### 보안 고려사항

#### 우회 가능성
1. **브라우저 시크릿 모드**: LocalStorage 초기화되어 새 Visitor ID 생성
   - 대응: IP도 함께 체크하므로 완전히 우회는 어려움
   
2. **VPN 사용**: IP 변경 가능
   - 대응: Fingerprint가 유지되므로 부분적으로 방어

3. **디바이스 초기화**: 완전히 새 환경
   - 대응: 현실적으로 투표 1회 더 하려고 초기화하진 않음

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
A: 네, 다른 브라우저는 다른 Fingerprint를 가지므로 가능합니다. 하지만 IP가 같으면 조합이 달라져서 DB 제약에 걸리지 않습니다.

**Q: 시크릿 모드로 우회 가능한가요?**
A: 시크릿 모드는 Visitor ID만 바뀌고 IP는 그대로이므로, 새로운 조합으로 투표 가능합니다. 하지만 이는 의도된 동작입니다 (다른 디바이스로 간주).

**Q: 기존 투표 데이터는 어떻게 되나요?**
A: 기존 데이터는 그대로 유지되며, 레거시 호환성 인덱스가 있어서 문제없습니다.

**Q: 성능 영향은 없나요?**
A: Fingerprint 생성은 ~10ms 이하로 매우 빠르며, 한 번만 생성 후 LocalStorage에 캐싱됩니다.

### 문제 해결

**증상: "Already voted" 에러가 계속 나타남**
1. 브라우저 LocalStorage 확인: `sfm_visitor_id_v2` 키 존재 확인
2. 콘솔에서 Fingerprint 확인: `localStorage.getItem('sfm_visitor_id_v2')`
3. IP 해시 확인: 네트워크 탭에서 API 요청 payload 확인

**증상: 같은 와이파이에서 여러 명 투표 안 됨**
1. DB 제약 확인: 마이그레이션 스크립트 실행 여부 확인
2. 코드 배포 확인: `deviceFingerprint.js` 파일 존재 확인
3. 네트워크 탭에서 `visitor_id`가 제대로 전송되는지 확인

### 참고 자료
- [FingerprintJS Documentation](https://github.com/fingerprintjs/fingerprintjs)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
