import React, { useMemo, useState } from 'react'
import Card from './Card'
import InitialAvatar from './InitialAvatar'
import ConfirmDialog from './ConfirmDialog'

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function MoMAdminPanel({
  match,
  matchOptions = [],
  selectedMatchId,
  onSelectMatch,
  roster = [],
  votes = [],
  tally = {},
  totalVotes = 0,
  loading = false,
  onAddVote,
  onOverrideVote,
  onDeleteVote,
  onResetVotes,
  momOverride,
  onClearOverride,
  overrideLocked = false,
  tieBreakMeta = null,
  isRefMatch = false,
  momManualOpen = false,
  onToggleManualOpen,
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [note, setNote] = useState('')
  const [savingVote, setSavingVote] = useState(false)
  const [overridePending, setOverridePending] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const [confirmState, setConfirmState] = useState({ open: false, mode: null })

  const hasMatchOptions = Array.isArray(matchOptions) && matchOptions.length > 0
  const resolvedSelectedMatchId = selectedMatchId ?? (match?.id != null ? String(match.id) : '')

  const rosterMap = useMemo(() => {
    const map = new Map()
    roster.forEach(player => {
      if (!player?.id) return
      map.set(String(player.id), player)
    })
    return map
  }, [roster])

  const sortedVotes = useMemo(() => {
    return [...votes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [votes])

  const leaders = useMemo(() => {
    const entries = Object.entries(tally || {})
    return entries
      .map(([pid, count]) => ({
        playerId: pid,
        count,
        player: rosterMap.get(pid) || null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  }, [tally, rosterMap])

  // match가 없는 렌더 경로에서도 훅이 동일하게 호출되도록 위에서 early return을 제거하고,
  // 렌더 직전에 분기 처리합니다.
  if (!match) {
    if (hasMatchOptions) {
      return (
        <Card title="관리자 MOM 기록 / 선정">
          <div className="space-y-3">
            <div className="text-sm text-stone-500">관리할 경기를 선택하세요.</div>
            <div className="max-w-sm">
              <select
                value={resolvedSelectedMatchId}
                onChange={(e) => onSelectMatch?.(e.target.value)}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
              >
                <option value="">경기 선택</option>
                {matchOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      )
    }
    return null
  }

  const matchLabel = formatDateTime(match.dateISO || match.date || match.created_at)
  const disableActions = !selectedPlayerId || !note.trim()

  const handleAddManualVote = async () => {
    if (disableActions || savingVote) return
    setSavingVote(true)
    try {
      await onAddVote?.({ playerId: selectedPlayerId, note: note.trim() })
      setNote('')
    } finally {
      setSavingVote(false)
    }
  }

  const requestOverride = () => {
    if (disableActions || overridePending || overrideLocked) return
    setConfirmState({ open: true, mode: 'override' })
  }

  const requestReset = () => {
    if (resetPending) return
    setConfirmState({ open: true, mode: 'reset' })
  }

  const handleConfirm = async () => {
    if (confirmState.mode === 'override') {
      setOverridePending(true)
      try {
        await onOverrideVote?.({ playerId: selectedPlayerId, note: note.trim() })
        setNote('')
      } finally {
        setOverridePending(false)
        setConfirmState({ open: false, mode: null })
      }
      return
    }
    if (confirmState.mode === 'reset') {
      setResetPending(true)
      try {
        await onResetVotes?.()
        setNote('')
        setSelectedPlayerId('')
      } finally {
        setResetPending(false)
        setConfirmState({ open: false, mode: null })
      }
      return
    }
    setConfirmState({ open: false, mode: null })
  }

  const handleDeleteVote = async (voteId) => {
    if (!voteId || !onDeleteVote) return
    const ok = window.confirm('선택한 MOM 기록을 삭제할까요?')
    if (!ok) return
    await onDeleteVote(voteId)
  }

  const currentLeader = leaders[0]
  const overridePlayer = momOverride ? rosterMap.get(String(momOverride.playerId)) : null
  const manualTiePending = tieBreakMeta?.requiresManual
  const tiePendingNames = (tieBreakMeta?.pendingCandidates || [])
    .map(pid => rosterMap.get(String(pid))?.name || pid)
    .filter(Boolean)

  return (
    <>
      <Card
        title={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-stone-900">관리자 MOM 기록 / 선정</div>
              <p className="text-xs text-stone-400">현재 선택: {matchLabel}</p>
            </div>
            {hasMatchOptions && (
              <div className="w-full sm:w-auto">
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-500">
                  📅 날짜별 경기 선택
                  <select
                    value={resolvedSelectedMatchId}
                    onChange={(e) => onSelectMatch?.(e.target.value)}
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  >
                    {matchOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        }
      >
        <div className="space-y-6">
          <section className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            <div className="flex flex-wrap items-center gap-3">
              <div className="font-semibold text-stone-900">현재 투표 수</div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-600 shadow-sm">
                {totalVotes}표
              </span>
              {currentLeader && (
                <span className="text-xs text-stone-500">
                  1위: <span className="notranslate" translate="no">{currentLeader.player?.name || currentLeader.playerId}</span> ({currentLeader.count}표)
                </span>
              )}
            </div>
            {leaders.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                {leaders.slice(1).map((leader) => (
                  <span key={leader.playerId} className="rounded-full bg-white px-2 py-0.5 shadow">
                    #<span className="notranslate" translate="no">{leader.player?.name || leader.playerId}</span> {leader.count}표
                  </span>
                ))}
              </div>
            )}
            {manualTiePending && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="font-semibold">득표 동률 – 임원진 결정 필요</div>
                <p className="mt-1 leading-relaxed">
                  골 → 어시스트 → 클린시트 → 출전까지 모두 동일합니다. 아래 <strong>"이 선수로 MOM 확정"</strong> 버튼으로 최종 결정을 저장해 주세요.
                </p>
                {tiePendingNames.length > 0 && (
                  <p className="mt-1 text-amber-800">
                    후보: <span className="notranslate" translate="no">{tiePendingNames.join(', ')}</span>
                  </p>
                )}
              </div>
            )}
          </section>

          {momOverride && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-amber-900">관리자 확정 완료</div>
                  <p className="text-xs text-amber-800">
                    <span className="notranslate" translate="no">{overridePlayer?.name || momOverride.playerId}</span>
                    {momOverride.note ? ` · ${momOverride.note}` : ''}
                  </p>
                  {momOverride.confirmedAt && (
                    <p className="text-[11px] text-amber-700">{formatDateTime(momOverride.confirmedAt)} 기준</p>
                  )}
                </div>
                {onClearOverride && (
                  <button
                    type="button"
                    onClick={onClearOverride}
                    className="inline-flex items-center justify-center rounded-xl border border-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    확정 해제
                  </button>
                )}
              </div>
            </section>
          )}

          {isRefMatch && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-blue-900">심판 모드 투표 제어</div>
                  <p className="text-xs text-blue-800">
                    심판 모드 경기는 투표가 자동으로 시작되지 않습니다. (3시간 후 자동 시작)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleManualOpen}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold shadow transition-colors ${
                    momManualOpen
                      ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {momManualOpen ? '투표 강제 종료 (자동전환)' : '투표 즉시 시작'}
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-stone-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-stone-900">기록 입력 & 수동 투표</div>
                <p className="text-xs text-stone-500">메모는 voter label에 저장되어 추후에도 확인할 수 있어요.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-500">선수 선택</label>
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="">선수를 선택하세요</option>
                  {roster.map((player) => (
                    <option key={player.id} value={player.id} className="notranslate" translate="no">
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-500">기록 메모</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 감독단 수동 선정"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddManualVote}
                disabled={disableActions || savingVote}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
              >
                {savingVote ? '기록 저장 중...' : '수동 투표 추가'}
              </button>
              <button
                type="button"
                onClick={requestOverride}
                disabled={disableActions || overridePending || overrideLocked}
                className="rounded-xl border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-700 disabled:opacity-50"
                title={overrideLocked ? '투표 진행 중에는 확정할 수 없습니다.' : undefined}
              >
                {overridePending ? '확정 중...' : '이 선수로 MOM 확정'}
              </button>
              <button
                type="button"
                onClick={requestReset}
                disabled={resetPending || loading}
                className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50"
              >
                {resetPending ? '삭제 중...' : '기록 전체 삭제'}
              </button>
            </div>
            <div className="mt-3 text-[11px] text-stone-500 space-y-1">
              <p>• 관리자 투표는 실제 투표 기록에 함께 저장됩니다.</p>
              <p>• 확정 버튼을 누르면 해당 선수로 결과가 잠금 처리됩니다.</p>
              {overrideLocked && (
                <p className="text-rose-500 font-semibold">투표 마감 후에만 관리자 확정을 적용할 수 있습니다.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-stone-900">현재 투표 기록</div>
              {loading && <span className="text-xs text-stone-400">불러오는 중...</span>}
            </div>
            {sortedVotes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
                아직 기록된 투표가 없습니다.
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {sortedVotes.map((vote) => {
                  const player = rosterMap.get(vote.playerId)
                  return (
                    <div
                      key={vote.id}
                      className="flex items-center justify-between rounded-xl border border-stone-100 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <InitialAvatar id={vote.playerId} name={player?.name || vote.playerId} size={36} photoUrl={player?.photoUrl} />
                        <div>
                          <div className="text-sm font-semibold text-stone-900 notranslate" translate="no">{player?.name || vote.playerId}</div>
                          <div className="text-xs text-stone-500">{vote.voterLabel || '메모 없음'}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <span className="text-[11px] text-stone-400">{formatDateTime(vote.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteVote(vote.id)}
                          className="text-xs font-semibold text-rose-600"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.mode === 'override' ? 'MOM 선정 변경' : 'MOM 기록 초기화'}
        message={confirmState.mode === 'override'
          ? '기존 기록을 모두 지우고 선택한 선수로 MOM을 확정할까요?'
          : '모든 MOM 투표 기록을 삭제합니다. 되돌릴 수 없습니다.'}
        confirmLabel={confirmState.mode === 'override' ? '확정하기' : '삭제하기'}
        cancelLabel="취소"
        tone={confirmState.mode === 'override' ? 'default' : 'danger'}
        onCancel={() => setConfirmState({ open: false, mode: null })}
        onConfirm={handleConfirm}
      />
    </>
  )
}
