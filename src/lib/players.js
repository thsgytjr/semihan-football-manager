// src/lib/players.js
import { v4 as uuidv4 } from "uuid"
import { DEFAULT_STATS, STAT_KEYS } from "./constants" // ✅ 공식 키/디폴트
import { randomAvatarDataUrl } from "../utils/avatar"

export const SYSTEM_ACCOUNT_STATUS = 'system'
const SYSTEM_ACCOUNT_STATS = STAT_KEYS.reduce((acc, key) => {
  acc[key] = 30
  return acc
}, {})

// 신규 선수 생성
export function mkPlayer(name = "", pos = "MF", stats = null, photoUrl = null, membership = 'guest', origin = 'none') {
  const s = stats ? { ...DEFAULT_STATS, ...stats } : { ...DEFAULT_STATS }
  const id = uuidv4()
  const avatar = photoUrl ?? randomAvatarDataUrl(name || id, 128)
  return { id, name, position: pos, stats: s, photoUrl: avatar, membership, origin }
}

export function mkSystemAccount(name = 'System Account') {
  const base = mkPlayer(name, '', SYSTEM_ACCOUNT_STATS)
  return {
    ...base,
    photoUrl: null,
    positions: [],
    membership: base.membership || 'guest',
    origin: 'none',
    tags: [],
    status: SYSTEM_ACCOUNT_STATUS,
    stats: { ...SYSTEM_ACCOUNT_STATS },
  }
}

export function isSystemAccount(player) {
  const status = typeof player?.status === 'string' ? player.status.toLowerCase() : ''
  return status === SYSTEM_ACCOUNT_STATUS
}

// ✅ 공식 STAT_KEYS 기준으로만 OVR 계산 (0–100 스케일 가정)
export function overall(p) {
  const s = p?.stats || {}
  const values = STAT_KEYS.map(k => {
    const v = Number(s[k])
    return Number.isFinite(v) ? v : 30
  })
  const avg = values.reduce((a, b) => a + b, 0) / STAT_KEYS.length
  return Math.round(avg)
}

// 선수가 Unknown(모든 능력치 30)인지 확인
export function isUnknownPlayer(p) {
  if (isSystemAccount(p)) return true
  const ovr = overall(p)
  return ovr === 30
}

// (예시) 기본 선수 목록 — 필요 시 기존 데이터 유지
export const defaultPlayers = [
  // mkPlayer("오인택", "FW", { Pace: 78, Shooting: 82, Passing: 67, Dribbling: 74, Physical: 55, Stamina: 80 }),
  // ...
]
