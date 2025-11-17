import React from 'react'
import { createPortal } from 'react-dom'
import Card from './Card'
import InitialAvatar from './InitialAvatar'
import { getCountdownParts } from '../lib/momUtils'

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
  const [selected, setSelected] = React.useState('')
  const [voterName, setVoterName] = React.useState('')
  const [viewAll, setViewAll] = React.useState(false)

  const selectList = viewAll || recommended.length === 0 ? roster : recommended
  const totalVotesLabel = totalVotes > 0 ? `${totalVotes}명이 참여했습니다` : '아직 투표가 없습니다'

  const voteDeadline = windowMeta?.voteEnd ? new Date(windowMeta.voteEnd) : null

  const formatDateTime = (date) => {
    if (!date || Number.isNaN(date.getTime())) return null
    return date.toLocaleString('ko-KR', {
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

  if (!match) return null

  React.useEffect(() => {
    if (!match || typeof document === 'undefined') return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [match])

  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  const list = selectList
  const matchLabel = new Date(match.dateISO).toLocaleString('ko-KR', {
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
                <div className="text-xs uppercase tracking-wide text-amber-600">오늘의 MOM 투표</div>
                <div className="text-lg font-bold text-stone-900">{matchLabel}</div>
                <div className="text-sm text-stone-600">
                  득점이 입력된 후 24시간 동안만 투표할 수 있어요.
                </div>
              </div>
            <button onClick={onClose} className="rounded-full p-2 text-stone-500 hover:bg-stone-100">✕</button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 min-h-0">
            <div className="rounded-lg border border-stone-100 bg-stone-50 px-4 py-3 text-xs text-stone-600 flex flex-col gap-1">
              <span className="font-semibold text-stone-700">총 참여 현황</span>
              <span className="text-sm font-medium text-stone-900">{totalVotesLabel}</span>
              {voteDeadlineLabel && (
                <span>투표 마감: {voteDeadlineLabel}</span>
              )}
              {countdownLabel && (
                <span className={`text-sm font-semibold ${countdown?.diffMs <= 5 * 60 * 1000 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  남은 시간 {countdownLabel}
                </span>
              )}
            </div>

          {recommended.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold text-amber-700">추천 후보 (득점/도움 TOP 5)</div>
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
                    <span>{player.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {alreadyVoted && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              이미 투표를 완료한 기록이 있어요. 결과는 리더보드에서 확인할 수 있습니다.
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-stone-700">
              <span>투표할 선수 선택</span>
              <button
                className="text-xs text-amber-600 hover:text-amber-800"
                onClick={() => setViewAll(v => !v)}
              >
                {viewAll ? '추천만 보기' : '모든 선수 보기'}
              </button>
            </div>
            {list.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-200 px-3 py-4 text-center text-sm text-stone-500">
                참석자 명단을 불러오는 중이거나 아직 등록되지 않았습니다.
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
                      <div className="font-semibold text-stone-800">{player.name}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-stone-600">투표자 이름 (선택)</label>
            <input
              type="text"
              value={voterName}
              onChange={e => setVoterName(e.target.value)}
              placeholder="익명으로 투표하려면 비워두세요"
              className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.code === 'duplicate_vote'
                ? '이미 투표를 완료했습니다. (동일 IP/디바이스 기준)'
                : '투표 중 오류가 발생했습니다.'}
            </div>
          )}

          <button
            disabled={!selected || submitting || alreadyVoted}
            onClick={() => onSubmit({ playerId: selected, voterLabel: voterName.trim() })}
            className="w-full rounded-lg bg-amber-500 py-3 text-center text-base font-semibold text-white shadow-md transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '투표 중...' : alreadyVoted ? '이미 투표 완료' : '투표 제출하기'}
          </button>

          <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
            • 1회만 투표할 수 있습니다.<br />
            • 추천 후보는 골/어시 합계 Top5 기준이며, 참석자 누구에게나 투표할 수 있습니다.<br />
            • 이미 투표한 경우 동일 IP/디바이스에서는 다시 표시되지 않습니다.<br />
            • 득표가 동률이면 골/어시 기록이 더 좋은 선수가 자동으로 선정됩니다.
          </div>
        </div>
      </Card>
      </div>
    </div>
  )

  return createPortal(popup, portalTarget)
}