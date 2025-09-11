// src/lib/analytics.js
// 대시보드용 집계 유틸

import { overall } from "./players"

export function sortByDateAsc(matches) {
  return [...(matches || [])].sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""))
}

export function formatDateLabel(dateISO) {
  if (!dateISO) return ""
  // 'YYYY-MM-DD HH:mm' 형태
  return dateISO.replace("T", " ").slice(0, 16)
}

/**
 * 참석 추이 시리즈 (라인차트)
 * [{ date: '2025-09-12 19:00', attendees: 18 }, ...]
 */
export function attendanceSeries(matches) {
  return sortByDateAsc(matches).map((m) => ({
    date: formatDateLabel(m.dateISO),
    attendees: (m.attendeeIds || []).length,
  }))
}

/**
 * 최근 N경기 평균 참석/추천 모드
 */
export function recentAttendanceSummary(matches, n = 4) {
  const sorted = sortByDateAsc(matches)
  const lastN = sorted.slice(-n)
  const total = lastN.reduce((a, m) => a + (m.attendeeIds?.length || 0), 0)
  const avg = lastN.length ? Math.round(total / lastN.length) : 0
  const suggested = avg >= 22 ? { mode: "11v11", teams: 2 } : { mode: "9v9", teams: 3 }
  return { sample: lastN.length, avg, suggested }
}

/**
 * 선수별 출석률/출석수
 * return: [{ id, name, rate, count }, ...]  (rate: 0~100)
 */
export function playerAttendance(players, matches) {
  const total = matches?.length || 0
  if (!total) return players.map((p) => ({ id: p.id, name: p.name, rate: 0, count: 0 }))
  const counts = new Map(players.map((p) => [p.id, 0]))
  for (const m of matches || []) {
    for (const id of m.attendeeIds || []) counts.set(id, (counts.get(id) || 0) + 1)
  }
  return players.map((p) => {
    const count = counts.get(p.id) || 0
    return { id: p.id, name: p.name, rate: Math.round((count / total) * 100), count }
  })
}

/**
 * 상위/하위 출석률(N명)
 */
export function topAttendance(players, matches, topN = 5) {
  const list = playerAttendance(players, matches).sort((a, b) => b.rate - a.rate)
  return list.slice(0, topN)
}
export function lowAttendance(players, matches, topN = 5) {
  const list = playerAttendance(players, matches).sort((a, b) => a.rate - b.rate)
  return list.slice(0, topN)
}

/**
 * 포지션 구성 파이
 * [{ name:'FW', value: 6 }, ...]
 */
export function positionComposition(players) {
  const pos = ["FW", "MF", "DF", "GK"]
  const map = Object.fromEntries(pos.map((p) => [p, 0]))
  for (const p of players || []) map[p.position] = (map[p.position] || 0) + 1
  return pos
    .map((k) => ({ name: k, value: map[k] || 0 }))
    .filter((x) => x.value > 0)
}

/**
 * 팀 평균 능력치/OVR 요약
 */
export function teamOverallSummary(players) {
  if (!players?.length) return { avgOVR: 0, medianOVR: 0 }
  const ovrs = players.map(overall).sort((a, b) => a - b)
  const avgOVR = Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length)
  const medianOVR = ovrs.length % 2
    ? ovrs[(ovrs.length - 1) / 2]
    : Math.round((ovrs[ovrs.length / 2 - 1] + ovrs[ovrs.length / 2]) / 2)
  return { avgOVR, medianOVR }
}

/**
 * 최근 저장된 매치 간단 리스트
 * [{ id, date, attendees, mode, teams }]
 */
export function recentMatches(matches, n = 3) {
  const sorted = sortByDateAsc(matches).slice(-n).reverse()
  return sorted.map((m) => ({
    id: m.id,
    date: formatDateLabel(m.dateISO),
    attendees: m.attendeeIds?.length || 0,
    mode: m.mode,
    teams: m.teamCount,
  }))
}
