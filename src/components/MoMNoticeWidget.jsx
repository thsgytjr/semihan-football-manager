import React, { useEffect, useMemo, useState } from 'react'
import { getCountdownParts } from '../lib/momUtils'
import InitialAvatar from './InitialAvatar'

const FIVE_MINUTES_MS = 5 * 60 * 1000

const computeCountdownState = (deadlineTs) => {
  if (!deadlineTs) return null
  const target = typeof deadlineTs === 'number' ? deadlineTs : new Date(deadlineTs).getTime()
  if (!Number.isFinite(target)) return null
  const parts = getCountdownParts(target, Date.now())
  if (!parts) return null
  const badge = parts.days > 0
    ? `${parts.days}d`
    : `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`
  const label = parts.label
  const urgent = typeof parts.diffMs === 'number' && parts.diffMs <= FIVE_MINUTES_MS
  return { badge, label, urgent, diffMs: parts.diffMs }
}

export function MoMNoticeWidget({ notice, onOpenMoM, onAlreadyVoted }) {
  const [isMinimized, setIsMinimized] = useState(true)
  const [hasBounced, setHasBounced] = useState(false)
  const [countdownState, setCountdownState] = useState(() => computeCountdownState(notice?.deadlineTs))

  useEffect(() => {
    setCountdownState(computeCountdownState(notice?.deadlineTs))
    if (!notice?.deadlineTs) return undefined
    const interval = setInterval(() => {
      setCountdownState(computeCountdownState(notice.deadlineTs))
    }, 1000)
    return () => clearInterval(interval)
  }, [notice?.deadlineTs])

  useEffect(() => {
    if (!notice?.visible) return
    setIsMinimized(true)
    setHasBounced(false)
  }, [notice?.matchLabel, notice?.visible])

  const memoizedLeaders = useMemo(() => notice?.leaders || [], [notice?.leaders])

  if (!notice?.visible) {
    return null
  }

  const urgent = countdownState?.urgent ?? notice.urgent
  const badgeText = countdownState?.badge ?? '마감'
  const longCountdown = countdownState?.label ?? notice.countdownLabel
  const canVote = Boolean(notice?.canVote)
  const alreadyVoted = Boolean(notice?.alreadyVoted)

  const ctaLabel = canVote ? '투표하러 가기' : (alreadyVoted ? '투표 완료' : '결과 확인하기')

  const handleCtaClick = () => {
    if (canVote) {
      onOpenMoM?.('vote')
      setIsMinimized(true)
      return
    }
    if (alreadyVoted) {
      onAlreadyVoted?.()
      return
    }
    onOpenMoM?.('announce')
    setIsMinimized(true)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        right: isMinimized ? '12px' : 'auto',
        left: isMinimized ? 'auto' : '50%',
        zIndex: 55,
        width: isMinimized ? '48px' : 'min(360px, calc(100vw - 16px))',
        height: isMinimized ? '48px' : 'auto',
        background: isMinimized ? 'linear-gradient(135deg, #fb923c, #f97316)' : 'white',
        borderRadius: isMinimized ? '50%' : '16px',
        boxShadow: isMinimized
          ? '0 14px 32px rgba(249, 115, 22, 0.35)'
          : '0 18px 45px rgba(15, 23, 42, 0.25)',
        border: isMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.4)',
  overflow: isMinimized ? 'visible' : 'hidden',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: isMinimized ? 'pointer' : 'default',
        transform: isMinimized ? 'none' : 'translateX(-50%)'
      }}
      onClick={isMinimized ? () => { setIsMinimized(false); setHasBounced(true) } : undefined}
    >
      {isMinimized ? (
        <div
          className={!hasBounced ? 'sfm-bouncy-icon' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            position: 'relative'
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color: 'white' }}>
            <path
              d="M12 2.5l2.46 4.98 5.5.8-3.98 3.88.94 5.48L12 14.74 7.08 17.64l.94-5.48L4.04 8.28l5.5-.8L12 2.5z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '-14px',
              right: '-14px',
              minWidth: '34px',
              height: '24px',
              padding: '0 6px',
              backgroundColor: urgent ? '#f87171' : '#facc15',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              color: urgent ? '#fff1f2' : '#78350f',
              fontWeight: 700,
              border: '2px solid #fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
            }}
          >
            {badgeText}
          </div>
          <style>{`
            @keyframes sfm-bounce {
              0%, 100% { transform: scale(1); }
              10% { transform: scale(1.08, 0.92); }
              20% { transform: scale(0.96, 1.04); }
              30% { transform: scale(1.04, 0.98); }
              40% { transform: scale(0.98, 1.02); }
              50% { transform: scale(1.02, 0.98); }
              60% { transform: scale(0.98, 1.01); }
              70% { transform: scale(1.01, 0.99); }
              80% { transform: scale(0.99, 1.01); }
              90% { transform: scale(1.01, 0.99); }
            }
            .sfm-bouncy-icon {
              animation: sfm-bounce 1.2s infinite cubic-bezier(.68,-0.55,.27,1.55);
            }
          `}</style>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 bg-white">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2.5l2.46 4.98 5.5.8-3.98 3.88.94 5.48L12 14.74 7.08 17.64l.94-5.48L4.04 8.28l5.5-.8L12 2.5z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">MoM 투표 안내</p>
                <p className="text-base font-bold text-slate-900">{notice.matchLabel}</p>
              </div>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title="최소화"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9"></polyline>
              </svg>
            </button>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className={`rounded-2xl border px-4 py-3 text-sm ${urgent ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              <span className="font-semibold">남은 시간</span>
              <span className="ml-2 font-mono text-base">{longCountdown}</span>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-inner">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">참여 현황</div>
              <div className="mt-1 text-3xl font-extrabold text-slate-900">{notice.totalVotes ?? 0}</div>
              <div className="text-xs text-slate-500">명이 투표에 참여했어요.</div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">현재 순위</p>
              {memoizedLeaders.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {memoizedLeaders.map((leader, idx) => (
                    <div
                      key={leader.playerId || idx}
                      className="flex items-center justify-between rounded-2xl border border-amber-50 bg-white/70 px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                        <span className="w-6 text-center text-xs font-bold text-amber-600">#{idx + 1}</span>
                        <InitialAvatar
                          id={leader.playerId}
                          name={leader.name}
                          size={32}
                          photoUrl={leader.photoUrl}
                        />
                        <span>{leader.name}</span>
                      </div>
                      <span className="text-xs text-slate-500">{leader.votes ?? 0}표</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                  아직 집계 중이에요. 잠시 후에 다시 확인해 주세요.
                </div>
              )}
            </div>
            <button
              type="button"
              className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg transition ${alreadyVoted && !canVote
                ? 'bg-gray-200 text-gray-500 hover:shadow-none'
                : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:shadow-xl'}`}
              onClick={handleCtaClick}
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MoMNoticeWidget
