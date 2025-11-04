// src/lib/match.js
import { overall } from './players'
import { calculateAIPower, analyzePlayerStrengths } from './aiPower'

// 매치 모드 자동 결정(기존 로직이 있으면 유지)
export function decideMode(count) {
  if (count <= 8) return { mode: '5v5' }
  if (count <= 16) return { mode: '7v7' }
  if (count <= 22) return { mode: '9v9' }
  return { mode: '11v11' }
}

// 균등 분배 - 스네이크 드래프트 방식 (최상위 선수들을 분산)
export function splitKTeams(players = [], k = 2, criterion = 'overall', matches = []) {
  const arr = [...players]
  
  // 정렬 기준 결정
  if (criterion === 'ai' && matches) {
    // AI Overall 기준으로 정렬
    arr.sort((a, b) => calculateAIPower(b, matches) - calculateAIPower(a, matches))
  } else {
    // Overall 기준
    arr.sort((a, b) => (b.ovr ?? overall(b)) - (a.ovr ?? overall(a)))
  }
  
  const teams = Array.from({ length: k }, () => [])
  
  // 스네이크 드래프트: 1->2->3->3->2->1 순서로 배정
  // 예: 2팀, 6명 정렬 [A,B,C,D,E,F] → Team1:[A,D,E], Team2:[B,C,F]
  let teamIdx = 0
  let direction = 1  // 1: 증가, -1: 감소
  
  for (let i = 0; i < arr.length; i++) {
    teams[teamIdx].push(arr[i])
    
    // 다음 팀 인덱스 계산
    teamIdx += direction
    
    // 끝에 도달하면 방향 전환
    if (teamIdx >= k) {
      teamIdx = k - 1
      direction = -1
    } else if (teamIdx < 0) {
      teamIdx = 0
      direction = 1
    }
  }
  
  // 스마트 밸런싱: 포지션별 강점 균형 조정
  if (criterion === 'ai' && matches && k === 2) {
    balanceTeamStrengths(teams, matches)
  }
  
  // 각 팀의 총합 계산 (GK 제외)
  const sums = teams.map(list =>
    list.filter(p => {
      // positions 배열 또는 레거시 position 필드 체크
      const positions = p.positions || (p.position ? [p.position] : [p.pos])
      return !positions.includes('GK') && (p.position || p.pos) !== 'GK'
    })
    .reduce((a, p) => a + (p.ovr ?? overall(p)), 0)
  )
  
  return { teams, sums }
}

/**
 * 팀 간 포지션별 강점 밸런싱
 * 공격이 강한 팀에는 수비가 약한 선수를, 수비가 강한 팀에는 공격이 약한 선수를 배치
 */
function balanceTeamStrengths(teams, matches) {
  if (teams.length !== 2) return // 2팀일 때만 작동
  
  const [team1, team2] = teams
  
  // 각 팀의 포지션별 강점 계산
  const getTeamStrengths = (team) => {
    const strengths = team.map(p => analyzePlayerStrengths(p))
    return {
      attack: strengths.reduce((sum, s) => sum + s.attack, 0) / team.length,
      defense: strengths.reduce((sum, s) => sum + s.defense, 0) / team.length,
      midfield: strengths.reduce((sum, s) => sum + s.midfield, 0) / team.length,
    }
  }
  
  let team1Str = getTeamStrengths(team1)
  let team2Str = getTeamStrengths(team2)
  
  // 불균형이 크면 선수 교환 시도 (최대 3번)
  for (let attempt = 0; attempt < 3; attempt++) {
    const attackDiff = Math.abs(team1Str.attack - team2Str.attack)
    const defenseDiff = Math.abs(team1Str.defense - team2Str.defense)
    
    // 불균형이 10 이상일 때만 교환
    if (attackDiff < 10 && defenseDiff < 10) break
    
    // 공격이 더 강한 팀과 약한 팀 찾기
    const strongAttackTeam = team1Str.attack > team2Str.attack ? team1 : team2
    const weakAttackTeam = team1Str.attack > team2Str.attack ? team2 : team1
    
    // 공격 강한 팀에서 수비형 선수 찾기
    let bestSwapIdx1 = -1
    let bestSwapIdx2 = -1
    let bestImprovement = 0
    
    for (let i = 0; i < strongAttackTeam.length; i++) {
      const p1 = strongAttackTeam[i]
      // positions 배열 또는 레거시 position 필드 체크
      const p1Positions = p1.positions || (p1.position ? [p1.position] : [p1.pos])
      if (p1Positions.includes('GK') || (p1.position || p1.pos) === 'GK') continue
      
      const str1 = analyzePlayerStrengths(p1)
      
      for (let j = 0; j < weakAttackTeam.length; j++) {
        const p2 = weakAttackTeam[j]
        // positions 배열 또는 레거시 position 필드 체크
        const p2Positions = p2.positions || (p2.position ? [p2.position] : [p2.pos])
        if (p2Positions.includes('GK') || (p2.position || p2.pos) === 'GK') continue
        
        const str2 = analyzePlayerStrengths(p2)
        
        // 공격-수비 상반된 선수끼리 교환하면 밸런스 개선
        if (str1.defense > str1.attack && str2.attack > str2.defense) {
          const improvement = Math.abs(str1.defense - str2.attack) + Math.abs(str2.defense - str1.attack)
          if (improvement > bestImprovement) {
            bestImprovement = improvement
            bestSwapIdx1 = i
            bestSwapIdx2 = j
          }
        }
      }
    }
    
    // 최적 교환 실행
    if (bestSwapIdx1 >= 0 && bestSwapIdx2 >= 0) {
      const temp = strongAttackTeam[bestSwapIdx1]
      strongAttackTeam[bestSwapIdx1] = weakAttackTeam[bestSwapIdx2]
      weakAttackTeam[bestSwapIdx2] = temp
      
      // 재계산
      team1Str = getTeamStrengths(team1)
      team2Str = getTeamStrengths(team2)
    } else {
      break // 더 이상 개선 불가
    }
  }
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
