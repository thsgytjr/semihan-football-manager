import React, { useEffect, useMemo, useState } from 'react'
import InitialAvatar from './InitialAvatar'
import { getCountdownParts } from '../lib/momUtils'

function formatMatchLabel(match) {
  if (!match?.dateISO) return ''
  try {
    return new Date(match.dateISO).toLocaleString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function MoMNotification({
  visible = false,
  match,
  windowMeta,
  nowTs = Date.now(),
  totalVotes = 0,
  leaders = [],
}) {
  const [isMinimized, setIsMinimized] = useState(true)

  useEffect(() => {
    setIsMinimized(true)
  }, [match?.id])

  const topLeaders = useMemo(() => leaders.slice(0, 3), [leaders])

  if (!visible || !match || !windowMeta?.voteEnd) return null

  const countdown = getCountdownParts(windowMeta.voteEnd, nowTs)
  const countdownLabel = countdown?.label ?? '마감'
  const urgent = countdown?.diffMs != null && countdown.diffMs <= 5 * 60 * 1000
  const matchLabel = formatMatchLabel(match)

  return (
    <div
      className="sfm-mom-notification"
      style={{
        position: 'fixed',
        top: isMinimized ? '72px' : '12px',
        right: '12px',
        zIndex: 60,
        width: isMinimized ? '56px' : 'min(360px, calc(100vw - 24px))',
        transition: 'all 0.3s ease',
      }}
    >
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg ring-2 ring-amber-200"
        >
          <span className="text-lg">⭐️</span>
          <span
            className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          >
            MOM
          </span>
          {countdownLabel && (
            <span className={`absolute -bottom-1.5 text-[10px] font-semibold ${urgent ? 'text-rose-600' : 'text-emerald-600'}`}>
              {countdownLabel}
            </span>
          )}
        </button>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">내 투표 완료</div>
              <div className="text-base font-bold text-stone-900">{matchLabel}</div>
              <div className="text-xs text-stone-500">남은 시간 {countdownLabel}</div>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className="rounded-full p-1 text-stone-400 hover:bg-stone-100"
              aria-label="MOM 알림 접기"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            총 <span className="font-semibold text-stone-900">{totalVotes}</span>명이 참여했어요.
          </div>

          <div className="mt-3 space-y-2">
            {topLeaders.length === 0 ? (
              <div className="text-xs text-stone-500">아직 집계 중입니다.</div>
            ) : (
              topLeaders.map((leader, idx) => (
                <div
                  key={leader.playerId || idx}
                  className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <InitialAvatar id={leader.playerId} name={leader.name} size={28} photoUrl={leader.photoUrl} />
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{leader.name}</div>
                      <div className="text-[11px] text-stone-500">득표 {leader.votes}표</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-600">#{idx + 1}</span>
                </div>
              ))
            )}
          </div>

        </div>
      )}
    </div>
  )
}
