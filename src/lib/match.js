// src/lib/match.js  — 장소 필드 추가
import { overall } from './players'

export function decideMode(count) {
  if (count >= 22) return { mode: '11v11', teams: 2 }
  return { mode: '9v9', teams: 3 }
}

export function scoreBy(p, criterion='overall'){
  const s = p.stats || {}
  switch(criterion){
    case 'attack':  return (s.Shooting||0) + (s.Dribbling||0) + (s.Passing||0)
    case 'physical': return (s.Physical||0) + (s.Stamina||0)
    case 'pace':    return (s.Pace||0)
    default:        return overall(p)
  }
}

export function splitKTeams(players, k=2, criterion='overall'){
  const sorted = [...players].sort((a,b)=> scoreBy(b,criterion) - scoreBy(a,criterion))
  const teams = Array.from({length:k}, _=> [])
  const sums  = Array.from({length:k}, _=> 0)
  for(const p of sorted){
    let idx = 0
    for(let i=1;i<k;i++){ if(sums[i] < sums[idx]) idx = i }
    teams[idx].push(p)
    sums[idx] += scoreBy(p,criterion)
  }
  return { teams, sums }
}

export function determineConfig(attendeeCount, selectionMode='auto', teamCount=null){
  if (selectionMode !== 'auto') {
    const mode = selectionMode
    let teams = teamCount ?? (mode === '11v11' ? 2 : 3)
    return { mode, teams: clampTeams(teams) }
  }
  const auto = decideMode(attendeeCount)
  let teams = teamCount ?? auto.teams
  return { mode: auto.mode, teams: clampTeams(teams) }
}
function clampTeams(n){ return Math.max(2, Math.min(8, Math.floor(n))) }

export function mkMatch({
  id, dateISO, attendeeIds = [],
  criterion = 'overall', players = [],
  selectionMode = 'auto', teamCount = null,
  location = null, // { name, address, mapsUrl }
}){
  const { mode, teams } = determineConfig(attendeeIds.length, selectionMode, teamCount)
  const attendeePlayers = players.filter(p=> attendeeIds.includes(p.id))
  const split = splitKTeams(attendeePlayers, teams, criterion)

  const teamIds = split.teams.map(list => list.map(p => p.id))
  const snapshot = Object.fromEntries(
    attendeePlayers.map(p => [p.id, { name: p.name, pos: p.position, ovr: overall(p) }])
  )

  return {
    id, dateISO, attendeeIds,
    selectionMode, mode, teamCount: teams, criterion,
    teamIds, snapshot,
    location: location ? {
      name: location.name || '', address: location.address || '', mapsUrl: location.mapsUrl || ''
    } : null,
  }
}

export function hydrateMatch(match, players){
  const byId = new Map(players.map(p => [p.id, p]))
  const teams = (match.teamIds || []).map(ids => ids.map(id => {
    const p = byId.get(id)
    if (p) return { id: p.id, name: p.name, position: p.position, ovr: overall(p), stats: p.stats, photoUrl: p.photoUrl, membership: p.membership }
    const snap = match.snapshot?.[id]
    return { id, name: snap?.name || '(탈퇴/삭제)', position: snap?.pos || '-', ovr: snap?.ovr || 0 }
  }))
  const sums = teams.map(list => list.reduce((a, x) => a + (x.ovr || 0), 0))
  return { ...match, teams, sums }
}
