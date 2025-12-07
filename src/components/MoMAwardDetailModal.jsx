import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Award, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import InitialAvatar from './InitialAvatar'
import { getMembershipBadge } from '../lib/membershipConfig'

function ensurePortalTarget() {
  if (typeof document === 'undefined') return null
  let node = document.getElementById('modal-root')
  if (!node) {
    node = document.createElement('div')
    node.id = 'modal-root'
    document.body.appendChild(node)
  }
  return node
}

export function MoMAwardDetailModal({
  open = false,
  player = null,
  awards = [],
  onClose,
  customMemberships = [],
}) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const portalTarget = ensurePortalTarget()
  if (!portalTarget) return null

  const membershipBadge = player?.membership ? getMembershipBadge(player.membership, customMemberships) : null
  const awardList = Array.isArray(awards) ? awards : []

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('mom.detail.title', { name: player?.name ?? 'Player' })}
      onClick={() => onClose?.()}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-amber-100 bg-amber-50/60 px-5 py-4">
          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Award className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                {t('mom.detail.subtitle')}
              </p>
              <h2 className="text-lg font-bold text-stone-900 notranslate" translate="no">
                {t('mom.detail.title', { name: player?.name ?? 'Player' })}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-stone-500 transition hover:bg-stone-200/80 hover:text-stone-700"
            aria-label={t('mom.detail.close')}
            onClick={() => onClose?.()}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-5 py-5">
          <section className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <InitialAvatar
              id={player?.id}
              name={player?.name}
              size={48}
              photoUrl={player?.photoUrl}
              badges={membershipBadge ? [membershipBadge.badge] : []}
              customMemberships={customMemberships}
              badgeInfo={membershipBadge}
            />
            <div>
              <p className="text-sm text-stone-500">{t('mom.detail.playerLabel')}</p>
              <p className="text-base font-semibold text-stone-900 notranslate" translate="no">{player?.name}</p>
              <p className="text-xs text-stone-400">{t('mom.detail.totalAwards', { count: awardList.length })}</p>
            </div>
          </section>

          {awardList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-500">
              {t('mom.detail.empty')}
            </div>
          ) : (
            <ul className="space-y-4">
              {awardList.map((award) => {
                const opponents = Array.isArray(award.opponents) ? award.opponents : []
                return (
                <li key={award.matchId} className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{award.matchLabel}</p>
                      <p className="text-xs text-stone-500">
                        {t('mom.detail.totalVotes', { count: award.totalVotes })}
                        {award.override && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                            {t('mom.detail.override')}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-amber-600">{t('mom.detail.votes', { count: award.playerVotes })}</p>
                      <p className={`text-xs font-semibold ${award.tie ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {award.tie
                          ? t('mom.detail.tie')
                          : (award.hasOpponents
                            ? t('mom.detail.margin', { diff: award.diff })
                            : t('mom.detail.solo'))}
                      </p>
                      {award.tie && (
                        <p className="mt-1 text-xs text-amber-700">
                          {t('mom.detail.tieBreakNote')}
                        </p>
                      )}
                    </div>
                  </div>

                  {opponents.length > 0 && (
                    <div className="mt-4 space-y-1 rounded-xl bg-amber-50/60 p-3 text-xs text-stone-600">
                      {opponents.map((opponent) => {
                        const badgeInfo = opponent.membership ? getMembershipBadge(opponent.membership, customMemberships) : null
                        return (
                          <div key={`${award.matchId}-${opponent.playerId}`} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <InitialAvatar
                                id={opponent.playerId}
                                name={opponent.name}
                                size={26}
                                photoUrl={opponent.photoUrl}
                                customMemberships={customMemberships}
                                badges={badgeInfo ? [badgeInfo.badge] : []}
                                badgeInfo={badgeInfo}
                              />
                              <span className="font-medium notranslate truncate" translate="no">{opponent.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-stone-700">{t('mom.detail.votes', { count: opponent.votes })}</span>
                              <span className="ml-2 inline-block min-w-[36px] text-right font-semibold text-emerald-600">
                                {t('mom.detail.marginShort', { diff: Math.max(0, opponent.diff ?? award.playerVotes - opponent.votes) })}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, portalTarget)
}
