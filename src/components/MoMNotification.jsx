import React, { useEffect, useMemo, useState } from 'react'
import InitialAvatar from './InitialAvatar'
import { getCountdownParts } from '../lib/momUtils'
import { useTranslation } from 'react-i18next'

function formatMatchLabel(match, locale = 'ko') {
  if (!match?.dateISO) return ''
  try {
    return new Date(match.dateISO).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', {
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
  const { t, i18n } = useTranslation()
  const [isMinimized, setIsMinimized] = useState(true)

  useEffect(() => {
    setIsMinimized(true)
  }, [match?.id])

  const topLeaders = useMemo(() => leaders.slice(0, 3), [leaders])

  if (!visible || !match || !windowMeta?.voteEnd) return null

  const countdown = getCountdownParts(windowMeta.voteEnd, nowTs)
  let countdownLabel = countdown?.label ?? t('mom.notice.badgeDeadline')
  if (countdownLabel && i18n.language !== 'ko') {
    countdownLabel = countdownLabel.replace('일', 'd')
  }
  const urgent = countdown?.diffMs != null && countdown.diffMs <= 5 * 60 * 1000
  const matchLabel = formatMatchLabel(match, i18n.language)

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
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">{t('mom.notification.myVoteDone')}</div>
              <div className="text-base font-bold text-stone-900">{matchLabel}</div>
              <div className="text-xs text-stone-500">{t('mom.notice.timeLeftLabel')} {countdownLabel}</div>
            </div>
            <button
              onClick={() => setIsMinimized(true)}
              className="rounded-full p-1 text-stone-400 hover:bg-stone-100"
              aria-label={t('mom.notification.closeAria')}
            >
              ✕
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {t('mom.notification.totalVoters', { count: totalVotes })}
          </div>

          <div className="mt-3 space-y-2">
            {topLeaders.length === 0 ? (
              <div className="text-xs text-stone-500">{t('mom.notification.countingShort')}</div>
            ) : (
              topLeaders.map((leader, idx) => (
                <div
                  key={leader.playerId || idx}
                  className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <InitialAvatar id={leader.playerId} name={leader.name} size={28} photoUrl={leader.photoUrl} />
                    <div>
                      <div className="text-sm font-semibold text-stone-900 notranslate" translate="no">{leader.name}</div>
                      <div className="text-[11px] text-stone-500">{t('mom.notice.votesLabel', { count: leader.votes })}</div>
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
