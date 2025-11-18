import React from 'react'
import { createPortal } from 'react-dom'
import Card from './Card'
import InitialAvatar from './InitialAvatar'
import { getCountdownParts } from '../lib/momUtils'
import { useTranslation } from 'react-i18next'

export function MoMPopup({
  match,
  roster = [],
  recommended = [],
  totalVotes = 0,
  windowMeta = null,
  alreadyVoted = false,
  nowTs = Date.now(),
  submitting,
  onClose,
  onSubmit,
  error,
}) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = React.useState('')
  const [voterName, setVoterName] = React.useState('')
  const [viewAll, setViewAll] = React.useState(false)

  const selectList = viewAll || recommended.length === 0 ? roster : recommended
  const totalVotesLabel = totalVotes > 0
    ? t('mom.popup.totalVotes', { count: totalVotes })
    : t('mom.popup.noVotes')

  const voteDeadline = windowMeta?.voteEnd ? new Date(windowMeta.voteEnd) : null

  const formatDateTime = (date) => {
    if (!date || Number.isNaN(date.getTime())) return null
    const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US'
    return date.toLocaleString(locale, {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const voteDeadlineLabel = voteDeadline ? formatDateTime(voteDeadline) : null

  React.useEffect(() => {
    if (!recommended?.length) return
    setSelected(recommended[0]?.id || '')
  }, [recommended])

  React.useEffect(() => {
    if (selected) return
    const fallback = (recommended[0]?.id) || (roster[0]?.id) || ''
    if (fallback) setSelected(fallback)
  }, [recommended, roster, selected])

  React.useEffect(() => {
    if (!match || typeof document === 'undefined') return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [match])

  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget || !match) return null

  const list = selectList
  const matchLabel = new Date(match.dateISO).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

  const voteCountdown = windowMeta?.voteEnd ? getCountdownParts(windowMeta.voteEnd, nowTs) : null
  const countdown = voteCountdown
  const countdownLabel = countdown?.label

  const popup = (
    <div className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative z-50 flex min-h-full items-end justify-center overflow-y-auto px-3 py-4 sm:items-center sm:px-6">
        <Card className="w-full max-w-lg sm:max-w-xl border-2 border-amber-200 bg-white shadow-2xl flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl min-h-[320px]">
          <div className="flex items-start justify-between gap-4 border-b border-amber-100 px-5 py-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-amber-600">{t('mom.popup.title')}</div>
                <div className="text-lg font-bold text-stone-900">{matchLabel}</div>
                <div className="text-sm text-stone-600">
                  {t('mom.popup.subText')}
                </div>
              </div>
            <button onClick={onClose} className="rounded-full p-2 text-stone-500 hover:bg-stone-100">✕</button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 min-h-0">
            <div className="rounded-lg border border-stone-100 bg-stone-50 px-4 py-3 text-xs text-stone-600 flex flex-col gap-1">
              <span className="font-semibold text-stone-700">{t('mom.popup.summaryTitle')}</span>
              <span className="text-sm font-medium text-stone-900">{totalVotesLabel}</span>
              {voteDeadlineLabel && (
                <span>{t('mom.popup.deadline', { date: voteDeadlineLabel })}</span>
              )}
              {countdownLabel && (
                <span className={`text-sm font-semibold ${countdown?.diffMs <= 5 * 60 * 1000 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {t('mom.popup.timeLeft', { label: i18n.language === 'ko' ? countdownLabel : countdownLabel?.replace('일', 'd') })}
                </span>
              )}
            </div>

          {recommended.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold text-amber-700">{t('mom.popup.recommended')}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recommended.map(player => (
                  <button
                    key={player.id}
                    onClick={() => setSelected(player.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                      selected === player.id
                        ? 'border-amber-500 bg-white text-amber-700 shadow'
                        : 'border-transparent bg-amber-100 text-amber-700 hover:bg-amber-200'
                    }`}
                  >
                    <InitialAvatar id={player.id} name={player.name} size={24} photoUrl={player.photoUrl} />
                    <span className="notranslate" translate="no">{player.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {alreadyVoted && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('mom.popup.alreadyVoted')}
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-stone-700">
              <span>{t('mom.popup.selectPlayer')}</span>
              <button
                className="text-xs text-amber-600 hover:text-amber-800"
                onClick={() => setViewAll(v => !v)}
              >
                {viewAll ? t('mom.popup.viewRecommended') : t('mom.popup.viewAll')}
              </button>
            </div>
            {list.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200 px-3 py-4 text-center text-sm text-stone-500">
                {t('mom.popup.loadingRoster')}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {list.map(player => (
                  <label
                    key={player.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-sm transition ${
                      selected === player.id ? 'border-amber-500 bg-white' : 'border-stone-200 bg-stone-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="momPlayer"
                      value={player.id}
                      checked={selected === player.id}
                      onChange={() => setSelected(player.id)}
                      className="text-amber-500"
                    />
                    <InitialAvatar id={player.id} name={player.name} size={32} photoUrl={player.photoUrl} />
                    <div className="flex-1">
                      <div className="font-semibold text-stone-800 notranslate" translate="no">{player.name}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-stone-600">{t('mom.popup.voterLabel')}</label>
            <input
              type="text"
              value={voterName}
              onChange={e => setVoterName(e.target.value)}
              placeholder={t('mom.popup.voterPlaceholder')}
              className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.code === 'duplicate_vote'
                ? t('mom.popup.errorDuplicate')
                : t('mom.popup.errorGeneric')}
            </div>
          )}

          <button
            disabled={!selected || submitting || alreadyVoted}
            onClick={() => onSubmit({ playerId: selected, voterLabel: voterName.trim() })}
            className="w-full rounded-lg bg-amber-500 py-3 text-center text-base font-semibold text-white shadow-md transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t('mom.popup.submitVoting') : alreadyVoted ? t('mom.popup.submitAlready') : t('mom.popup.submit')}
          </button>

          <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
            • {t('mom.popup.rule1')}<br />
            • {t('mom.popup.rule2')}<br />
            • {t('mom.popup.rule3')}<br />
            • {t('mom.popup.rule4')}
          </div>
        </div>
      </Card>
      </div>
    </div>
  )

  return createPortal(popup, portalTarget)
}