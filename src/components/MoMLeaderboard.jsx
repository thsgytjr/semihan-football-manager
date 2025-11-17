import React, { useMemo } from 'react'
import InitialAvatar from './InitialAvatar'
import { getMembershipBadge } from '../lib/membershipConfig'

export function MoMLeaderboard({
  countsByPlayer = {},
  players = [],
  showAll = false,
  onToggle,
  customMemberships = [],
}) {
  const playerMap = useMemo(() => {
    const map = new Map()
    players.forEach(player => {
      if (player?.id != null) {
        map.set(String(player.id), player)
      }
    })
    return map
  }, [players])

  const rows = useMemo(() => {
    const entries = Object.entries(countsByPlayer || {})
    const mapped = entries
      .map(([pid, count]) => {
        const player = playerMap.get(String(pid)) || {}
        return {
          playerId: pid,
          count,
          name: player.name || `Player ${pid}`,
          photoUrl: player.photoUrl,
          membership: player.membership,
        }
      })
      .filter(item => item.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return a.name.localeCompare(b.name)
      })
      .map((item, index) => ({ ...item, rank: index + 1 }))
    return mapped
  }, [countsByPlayer, playerMap])

  const displayRows = showAll ? rows : rows.slice(0, 5)

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
        아직 MOM 수상 기록이 없습니다.
      </div>
    )
  }

  const totalPlayers = rows.length

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
        <div className="text-sm font-semibold text-stone-800">
          MOM 누적 랭킹 <span className="text-xs font-normal text-stone-500">(선수 {totalPlayers}명)</span>
        </div>
        <button
          onClick={() => onToggle?.()}
          className="text-xs font-semibold text-amber-600 hover:text-amber-700"
        >
          {showAll ? '상위만 보기' : '전체 보기'}
        </button>
      </div>
      <ul className="divide-y divide-amber-50">
        {displayRows.map(row => (
          <li key={row.playerId} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold text-amber-600 w-5 text-center">{row.rank}</div>
              <InitialAvatar
                id={row.playerId}
                name={row.name}
                size={36}
                photoUrl={row.photoUrl}
                badges={getBadge(row.membership, customMemberships)}
                customMemberships={customMemberships}
                badgeInfo={getMembershipBadge(row.membership, customMemberships)}
              />
              <div>
                <div className="text-sm font-semibold text-stone-900">{row.name}</div>
                <div className="text-xs text-stone-500">누적 {row.count}회 수상</div>
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{row.count}회</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function getBadge(membership, customMemberships = []) {
  const badgeInfo = getMembershipBadge(membership, customMemberships)
  if (!badgeInfo) return []
  return [badgeInfo.badge]
}
