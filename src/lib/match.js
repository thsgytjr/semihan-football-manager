// src/lib/match.js
import { overall } from './players'

// 매치 모드 자동 결정(기존 로직이 있으면 유지)
export function decideMode(count) {
  if (count <= 8) return { mode: '5v5' }
  if (count <= 16) return { mode: '7v7' }
  if (count <= 22) return { mode: '9v9' }
  return { mode: '11v11' }
}

// 균등 분배(기존 구현이 있다면 사용). 여기서는 안전한 더미만 둡니다.
export function splitKTeams(players = [], k = 2, criterion = 'overall') {
  const arr = [...players]
  // 대략적인 정렬(OVR 기준)
  if (criterion === 'overall') {
    arr.sort((a, b) => (b.ovr ?? overall(b)) - (a.ovr ?? overall(a)))
  }
  const teams = Array.from({ length: k }, () => [])
  arr.forEach((p, i) => teams[i % k].push(p))
  const sums = teams.map(list =>
    list.filter(p => (p.position || p.pos) !== 'GK')
        .reduce((a, p) => a + (p.ovr ?? overall(p)), 0)
  )
  return { teams, sums }
}

// 저장용 매치 객체 만들기
export function mkMatch(input) {
  const {
    id,
    dateISO,
    attendeeIds = [],
    criterion = 'overall',
    players = [],
    selectionMode = 'manual',
    teamCount = 2,
    location = null,
    mode = '7v7',
    snapshot = [],        // [[playerId,...], ...]
    board = [],           // 포메이션 좌표(팀별)
    formations = [],      // 팀별 포메이션 문자열
    locked = true,
    videos = []
  } = input || {}

  return {
    id,
    dateISO,
    attendeeIds,
    criterion,
    teamCount,
    location,
    mode,
    // ⬇️ 반드시 보존
    snapshot: Array.isArray(snapshot) ? snapshot : [],
    board: Array.isArray(board) ? board : [],
    formations: Array.isArray(formations) ? formations : [],
    selectionMode,
    locked: !!locked,
    // 확장 가능 필드
    videos: Array.isArray(videos) ? videos : []
  }
}

// 저장된 매치 → 화면용으로 복원
export function hydrateMatch(m, players = []) {
  const byId = new Map(players.map(p => [String(p.id), p]))

  // 1) ✅ snapshot이 있으면 무조건 스냅샷 우선 복원
  if (Array.isArray(m?.snapshot) && m.snapshot.length > 0) {
    const teams = m.snapshot.map(ids =>
      (ids || []).map(id => byId.get(String(id))).filter(Boolean)
    )
    return { ...m, teams }
  }

  // 2) ⛳️ 스냅샷이 없을 경우에만 참석자/팀수로 재분배
  const attendeeList = (m?.attendeeIds || []).map(id => byId.get(String(id))).filter(Boolean)
  const k = Math.max(2, Number(m?.teamCount || 2))
  const { teams } = splitKTeams(attendeeList, k, m?.criterion || 'overall')
  return { ...m, teams }
}
