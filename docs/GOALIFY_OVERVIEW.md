# Goalify Application Documentation

> 버전: 2025-11-08  
> 핵심 목적: 교회/아마추어 축구(풋살) 동호회의 "참여 · 경쟁 · 기록 · 투명성"을 자동화하고 재미(게이미피케이션)를 추가하는 멀티 테넌트 플랫폼.

---
## 1. 앱의 비전 & 목표
1. 주간 모임(정기 경기)에 **리더보드/승점/듀오** 등의 아케이드 요소를 도입하여 집중력과 몰입도 향상.
2. 매주 달라지는 참석 선수 변동 → 팀 배정 혼란, 회비 정산, 마지막 순간의 변수 처리 문제를 **데이터 기반 선수 관리 / 출석 예측 / 자동 비용 계산 / Draft 모드**로 해결.
3. 여러 팀(동호회)이 **같은 코드베이스**를 사용하되 각자 독립적인 Supabase 프로젝트 + Vercel 배포를 통해 데이터 격리 & 브랜드 커스터마이징.

---
## 2. 주요 사용자 역할
| 역할 | 권한 | 예시 기능 |
|------|------|-----------|
| 일반 회원 | 리더보드 조회, 매치 히스토리 열람, 예정된 매치 확인 | Dashboard, Upcoming Match, Match Details |
| 관리자(Admin) | 선수 CRUD, 태그/멤버십 커스텀, 매치 생성·저장, 드래프트 진행, 팀 색상/포메이션 편집 | Match Planner, Player Manager, Upcoming → Official 변환 |

---
## 3. 데이터 핵심 개념
| 개념 | 설명 | 주요 필드 |
|------|------|-----------|
| Player | 선수 프로필 + 능력치 + 멤버십/태그 | id, name, stats{ Pace,Shooting,... }, membership, tags[], positions[] |
| Upcoming Match | 확정 전 상태. 참가자, 팀 수, 주장, Draft 진행 여부 | id, dateISO, participantIds, teamCount, captainIds, isDraftMode, snapshot |
| Official Match (Saved) | 리더보드에 반영. 쿼터점수/골어시/드래프트 승패 포함 | id, dateISO, attendeeIds, snapshot, quarterScores, stats, draft{captains,...} |
| Leaderboard Row | 동적 계산 결과 | attackRows, duoRows, draftWins, captainWins |
| Fees(회비) | 경기당 비용 분배 로직 결과 | total, memberFee, guestFee, guestSurcharge |

---
## 4. 매치 타입 & 라이프사이클
1. 예정(Upcoming) 생성 → 참가자/팀수/주장/예상비용 입력.
2. Draft Mode가 켜진 경우: 
   - 상태 표시: "Draft in Progress" → 주장들이 팀 꾸리는 중.
   - Draft 완료 시 `isDraftComplete=true` → 팀 스냅샷 고정.
3. 매치 확정 후 저장(Save Match): Official Match로 전환 → 리더보드 집계에 포함.
4. 시간 경과 후 Stats 입력 / Quarter Scores 추가 → 승/무/패 및 공격 포인트 반영.
5. 만료된 예정 매치 자동 필터링(`filterExpiredMatches`).

상태 구분 함수: `getMatchStatus(match)` → upcoming | drafting | live | completed.

---
## 5. Draft Match 규칙 (현재 vs 미래 방향)
### 2팀
- 쿼터별 승자 수 > 동률이면 총득점 비교 → 최종 승자.
- 개별 선수: 승리 팀 소속이면 승점 증가.
- 주장: 승리 시 주장 승점/개인 승점 모두 반영.

### 3팀 이상 (현재 구현)
- 모든 쿼터에서 각 팀의 골득실(상대 평균 대비)을 계산 → 팀별 최고 골득실 비교.
- 최고 골득실 동률이면 무승부(-1).

### 원하는 미래 방향
- 모든 팀이 동일한 횟수로 맞붙을 수 있을 때 리그 방식: 승/무/패 기록 + 골득실 순위. (확장 지점: `winnerIndexFromQuarterScores` 재설계)

---
## 6. 리더보드 계산 메커니즘
| 분류 | 파일 | 핵심 로직 |
|------|------|-----------|
| 공격 포인트(골+어시+출전) | `leaderboardComputations.computeAttackRows` | 출전 경기수(gp), 골(g), 어시(a) → pts=g+a, isGuest 여부 |
| 듀오(Assist → Goal 페어) | `computeDuoRows` | 이벤트 추출 후 시간 순서 매칭 → 듀오별 count, rank tie 처리 |
| 드래프트 선수 승점 | `computeDraftPlayerStatsRows` | 드래프트 매치만 필터, W=3점 D=1점 → 최근 승리 시점 tie-break |
| 주장 승점 | `computeCaptainStatsRows` | 캡틴 목록 추출 후 동일한 승점 정렬 우선순위 적용 |
| 드래프트 공격 포인트 | `computeDraftAttackRows` | 드래프트 매치 subset에서 골/어시/출전 재계산 + 경기당 지표(gpg, apa) |

순위 규칙 공통: 승점 또는 주요 비교키 동일 시 동순위(rank 유지), 정렬 순서는 세부 tie-break.

---
## 7. 선수 시스템
- 생성: `mkPlayer(name,pos,stats,membership)` → 기본 스탯 `DEFAULT_STATS(=50)`.
- 종합 OVR: `overall(player)` → `STAT_KEYS` 평균 (Unknown=30) → 등급 시각화.
- 멤버십: 'member', 'guest', 커스텀(`membershipSettings`) → 배지 렌더링.
- 포지션: 레거시 `position` → 마이그레이션 `positions[]` (다중 지원). 헬퍼 `migratePositionToPositions`.
- 태그: `tags[{name,color}]` → 빠른 필터/추가 기능 (QuickAttendanceEditor).

---
## 8. 팀 배정 알고리즘
### 기본 Pos-Aware Split
`splitKTeamsPosAware(players,k)`:
- 포지션 그룹(GK/DF/MF/FW/OTHER)별 정렬(OVR) → 균등 분배 + 비GK 총합 밸런싱.

### AI 배정 (고급)
`smartDistributeAdvanced(players, teamCount, seed)`:
1. AI 파워 계산: `calculateAIPower(player, matches)` (과거 성과 + 능력치 조합) → 파워 정렬.
2. 포지션별 그룹화 (GK→DF→MF→FW→OTHER).
3. 팀 통계 추적: totalPower, count, posCount.
4. 후보 팀 선택 우선순위: 인원수 < 포지션 수 < 평균 파워 < 인덱스.
5. 불균형(차이≥2) 감지 로깅.

### 수동 조작 & 정렬
- 정렬 모드: 이름, 포지션, Overall, AI 파워 → `activeSortMode`.
- 드래그 앤 드롭: `@dnd-kit` 활용, 팀 간 이동 시 포메이션 재배치.
- 주장 고정: 저장 시 팀 내 주장 맨 앞으로 이동.
- 팀 색상 커스터마이징: 프리셋 + 커스텀 HEX + 대비 텍스트 계산.

---
## 9. 회비(Fees) 계산 모델
`calcFees({ total, memberCount, guestCount, guestSurcharge })`:
- 게스트 = 멤버 + surcharge.
- 총합: `total = memberFee * count + surcharge * guestCount` → memberFee 역산 후 0.5 단위 반올림.
- 저장 시 실제 참가자 기반 재계산(`computeFeesAtSave`).

필드: `{ total, memberFee, guestFee, sum }`.

---
## 10. Upcoming Match 스키마 & 자동 업데이트
필드 요약:
```json
{
  "id": "upcoming_...",
  "type": "upcoming",
  "dateISO": "2025-11-15T06:30:00.000Z",
  "location": { "preset": "park", "name": "OO구장", "address": "..." },
  "mode": "7v7",
  "participantIds": ["p1","p2"],
  "status": "upcoming|drafting|completed",
  "isDraftMode": true,
  "captainIds": ["c1","c2"],
  "teamCount": 2,
  "snapshot": [["c1","p1"],["c2","p2"]]
}
```
- Planner에서 팀/주장 변경 시 자동 `onUpdateUpcomingMatch` 호출 (silent patch).
- Draft 완료 체크박스를 통해 `isDraftComplete` 전환.
- 만료 처리: 시작 후 +12시간 기준 `isMatchExpired`.

---
## 11. DB 스키마 & 마이그레이션 핵심
### 주요 테이블: `matches`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text | 매치 식별자 (UUID/시간 기반) |
| room_id | text | 멀티 테넌트 팀 스코프 (`TEAM_CONFIG.shortName`) |
| dateISO | timestamptz | UTC 기반 저장 (프런트는 local → ISO 변환) |
| attendeeIds | jsonb[] / jsonb | 참가 선수 ID 배열 |
| snapshot | jsonb | 팀 구성(배열의 배열) |
| stats | jsonb | 골/어시 JSON 구조 |
| draft | jsonb | 주장 등 드래프트 메타 |
| quarterScores | jsonb | 쿼터별 점수(2D 배열) |
| fees | jsonb | 비용 계산 결과 |
| teamColors | jsonb | 커스텀 팀 색상 배열 |
| location | jsonb | {preset,name,address} (JSONB로 표준화) |
| selectionMode | text | 'draft' | 'manual' |

### 마이그레이션 포인트
- DKSC → TIMESTAMP → TIMESTAMPTZ 변환 (시간 불일치 문제 해결).
- `location` TEXT(JSON string) → JSONB 변환.
- 타입 검증 DO 블럭 + 인덱스 재생성(`dateISO`).

### 서비스 변환 레이어
`matches.service.js` 내부 `toAppFormat` / `toDbFormat`: 레거시 키(`date_iso`, `attendee_ids`) → camelCase.

---
## 12. 관리자 워크플로우 (실전 시나리오)
1. 선수 최신 멤버십/태그/능력치 업데이트.
2. Match Planner 접속 → 날짜/장소/팀 수 설정.
3. 빠른 선수 추가(태그/멤버십 필터)로 참석자 배정.
4. 필요 시 AI 배정 → 팀 균형 확보 → 주장 지정.
5. Draft 모드라면: "예정 매치로 저장" → 멤버들은 대시보드에서 진행상황 확인.
6. Draft 완료 후 체크박스 → 팀 확정.
7. 경기 직전/직후 "매치 저장" → Official Match 생성.
8. 경기 후 골/어시/쿼터 점수 입력(Stats UI) → 리더보드 자동 반영.
9. 자동 비용 계산 결과 확인 → 외부 회비 시스템과 동기화(미래 기능: 실제 결제 연동).

---
## 13. 멀티 테넌트 & 브랜딩
- Supabase: 팀별 독립 프로젝트 (DB/Storage/Auth 격리).
- Vercel: 환경변수로 팀 이름/설명/URL/이미지 설정 (`VITE_TEAM_NAME`, `VITE_APP_DESCRIPTION`, `VITE_APP_URL`).
- `vite.config.js` HTML Transform 플러그인 → 빌드 시 OG/Twitter 메타 자동 주입.
- Fallback: CI 환경에서 누락 시 경고 로그 + 안전 기본값.

---
## 14. 확장 지점 (커스텀 & 미래)
| 영역 | 어떻게 확장? | 관련 파일 |
|------|-------------|-----------|
| 매치 타입 | Draft 외 Cup/League 추가 | `matchHelpers.js`, 승자 로직 모듈화 |
| 추가 통계 | 슈팅 정확도, 세이브율 | `leaderboardComputations.js` 확장 |
| 결제/청구 | Stripe 등 연동 | 새 `billing.service.js` 도입 |
| 알림 | Discord/Webhook | `services/notifications.service.js` 예상 |
| 멤버십 | 더 많은 등급/혜택 | `membershipConfig.js` + UI 배지 확장 |

---
## 15. 품질 & 테스트 권장
현재: 계산 로직 대부분 수동 테스트. 권장:
- Unit: `computeAttackRows`, `winnerIndexFromQuarterScores` 엣지 케이스(동점/3팀 동일 골득실).
- Integration: Draft → Save → Leaderboard 흐름.
- Snapshot Test: 팀 배정(AI) 결과 안정성.
- Performance: 대량 매치(>500) 로딩 시 sort/rank O(N log N) 검증.

---
## 16. 로드맵 (제안)
1. 3팀 이상 리그식 자동 라운드 로빈 + 순위 표준화.
2. 실시간 Draft UI (웹소켓) → 주장 간 경쟁형 인터랙션.
3. 자동 출석 예상 (최근 참석 패턴 ML 미니 모델).
4. 회비 지급/정산 모듈 (정회원 vs 게스트 자동 청구).
5. 포메이션 에디터 강화: 드래그 배치 + 롤(Role)/전술 메모.
6. 모바일 PWA 최적화 + 오프라인 캐시.
7. 멀티 시즌(Season) 단위 통계 집계 및 리셋.

---
## 17. 참고 코드 맵핑
| 기능 | 파일 |
|------|------|
| Draft 판별 | `matchHelpers.isDraftMatch` |
| 주장 추출 | `matchHelpers.getCaptains` |
| 팀 스냅샷 로드 | `hydrateMatch` (in `match.js`) |
| 리더보드 집계 | `leaderboardComputations.js` |
| 선수 생성 & OVR | `players.js` / `constants.js` |
| 출석/배정 편집 | `MatchPlanner.jsx` (QuickAttendanceEditor, TeamColumn) |
| Upcoming 관리 | `upcomingMatch.js` |
| DB 변환 계층 | `matches.service.js` |
| 포지션 기반 배정 | `splitKTeamsPosAware` (내부), `formation.js` |
| AI 파워 계산 | `aiPower.js` |

---
## 18. 용어 정리 (Glossary)
| 용어 | 의미 |
|------|------|
| Draft | 주장이 팀을 선택하는 특수 매치 모드 |
| Snapshot | 저장 시점의 팀 구성(선수 ID 2D 배열) |
| Quarter Scores | 쿼터(구간)별 팀 득점 배열 |
| Duo | 한 경기 내 Assist → Goal 순차 이벤트 페어 |
| OVR | 선수가 여러 능력치 평균으로 계산된 종합 점수 |
| AI Power | 과거 성과 + 스탯 기반 산정된 내부 팀 밸런싱 점수 |
| Fees | 경기 비용을 멤버/게스트에 분배한 결과 |

---
## 19. 빠른 온보딩 (새 관리자용)
1. `.env.local` 작성 (Supabase + TEAM vars).
2. SQL 마이그레이션 적용 (TIMESTAMPTZ / JSONB 위치 필드).
3. 선수 몇 명 추가 → 능력치 입력.
4. Match Planner → 참가자 선택 → AI 배정 → 주장 지정.
5. "예정 매치로 저장" → 대시보드에서 Draft 상태 확인.
6. Draft 완료 후 "매치 저장"으로 공식화.
7. 경기 후 Stats 입력 → 리더보드 즉시 반영.
8. 비용 표시 확인 후 팀 공지.

---
## 20. 유지보수 팁
- 새로운 컬럼 추가 시: `matches.service.js` 변환 레이어 먼저 업데이트.
- 리더보드 확장: 기존 함수 패턴(계산 → 정렬 → rank 부여) 재사용.
- 다국어(i18n) 준비: 문자열 모음 파일 분리 필요(현재 하드코딩 다수).
- 성능: 대량 매치 집계 시 Map 사용(이미 적용) 계속 유지.

---
## 21. 보안 & 격리
- `room_id`로 팀 데이터 범위 제한.
- Supabase RLS 정책 적용 권장(현재 문서에 규칙 명시 필요).
- 민감 데이터(비용/멤버십 등) 관리자 전용 UI로 제한.

---
## 22. 메타 & 공유(브랜딩)
- Vite HTML Transform: OG/Twitter meta 자동 삽입.
- 캐시 무효화: 이미지 `?v=timestamp` 쿼리 사용 → Kakao 등 프리뷰 갱신.

---
## 23. 개선 필요 영역 (리스크)
| 영역 | 현재 리스크 | 개선안 |
|------|-------------|--------|
| 시간대 처리 | 지역 시간→UTC 변환 실수 가능 | UI 변환 유틸 공통화 (helper) |
| Draft 알고리즘(3팀) | 골득실 방식 직관성 낮음 | 라운드 로빈 구현 + 명확한 승점 규칙 |
| Stats 입력 | UI 누락/오타 가능 | 폼 검증 + 이벤트 기반 기록 개선 |
| 비용 계산 | 멤버십 변동 반영 지연 | 저장 시 멤버십 스냅샷 캐싱 |
| 코드 중복 | Planner 로직 비대 | 훨씬 작은 훅/모듈로 분해 |

---
## 24. 문서 업데이트 규칙
- 기능 추가/변경 시 해당 섹션 번호에 (변경일) 표기.
- 마이그레이션 발생 시 11번(스키마)와 로드맵에 반영.
- 3개월 주기 전반 리뷰 권장.

---
*문의/기여: GitHub Issues 활용. 내부 운영 관련 확장 시 별도 PRIVATE 문서 추천.*
