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
          <section className="rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="font-bold text-blue-900">📊 현재 투표 현황</div>
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow">
                {totalVotes}표
              </span>
              {currentLeader && (
                <span className="text-sm font-semibold text-blue-700">
                  🏆 <span className="notranslate" translate="no">{currentLeader.player?.name || currentLeader.playerId}</span> ({currentLeader.count}표)
                </span>
              )}
            </div>
            {leaders.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {leaders.slice(1).map((leader, idx) => (
                  <span key={leader.playerId} className="text-xs font-medium text-blue-600 bg-white rounded-full px-2.5 py-1 shadow-sm">
                    {idx === 0 ? '🥈' : '🥉'} <span className="notranslate" translate="no">{leader.player?.name || leader.playerId}</span> {leader.count}표
                  </span>
                ))}
              </div>
            )}
            {manualTiePending && (
              <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2">
                <div className="text-sm font-bold text-amber-900">⚠️ 동점 - 관리자 결정 필요</div>
                <p className="text-xs text-amber-800 mt-1">
                  득점·어시스트·클린시트가 모두 같아 자동 선정이 불가능합니다.<br/>
                  후보: <span className="notranslate font-semibold" translate="no">{tiePendingNames.join(', ')}</span>
                </p>
              </div>
            )}
          </section>

          {momOverride && (
            <section className="rounded-xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 p-4 shadow-md">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-bold text-green-900 flex items-center gap-2">
                    ✅ MOM 확정 완료
                  </div>
                  <p className="text-sm font-semibold text-green-800 mt-1">
                    <span className="notranslate" translate="no">{overridePlayer?.name || momOverride.playerId}</span>
                    {momOverride.note && <span className="text-xs font-normal"> · {momOverride.note}</span>}
                  </p>
                  {momOverride.confirmedAt && (
                    <p className="text-xs text-green-700 mt-0.5">{formatDateTime(momOverride.confirmedAt)}</p>
                  )}
                </div>
                {onClearOverride && (
                  <button
                    type="button"
                    onClick={onClearOverride}
                    className="rounded-lg border-2 border-green-500 bg-white hover:bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition-colors"
                  >
                    확정 해제
                  </button>
                )}
              </div>
            </section>
          )}

          {isRefMatch && (
            <section className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-bold text-indigo-900">⏱️ 심판 모드 투표</div>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    심판 모드는 3시간 후 자동 시작됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleManualOpen}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold shadow-sm transition-all ${
                    momManualOpen
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {momManualOpen ? '투표 종료' : '즉시 시작'}
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-base font-bold text-amber-900 flex items-center gap-2">
                ⭐ MOM 선정하기
              </div>
              <p className="text-xs text-amber-700 mt-1">선수를 선택하고 확정 버튼을 누르세요.</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-amber-800">선수 선택</label>
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="w-full rounded-lg border-2 border-amber-300 bg-white px-3 py-2.5 text-sm font-medium shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
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
                <label className="text-xs font-bold text-amber-800">메모 (선택)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 감독단 결정"
                  className="w-full rounded-lg border-2 border-amber-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={requestOverride}
                disabled={!selectedPlayerId || overridePending || overrideLocked}
                className="w-full rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={overrideLocked ? '투표 진행 중에는 확정할 수 없습니다.' : undefined}
              >
                {overridePending ? '확정 중...' : '✅ 이 선수로 MOM 확정'}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddManualVote}
                  disabled={disableActions || savingVote}
                  className="flex-1 rounded-lg border-2 border-amber-400 bg-white hover:bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors disabled:opacity-50"
                >
                  {savingVote ? '저장 중...' : '투표만 추가'}
                </button>
                <button
                  type="button"
                  onClick={requestReset}
                  disabled={resetPending || loading}
                  className="flex-1 rounded-lg border-2 border-rose-300 bg-white hover:bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors disabled:opacity-50"
                >
                  {resetPending ? '삭제 중...' : '전체 삭제'}
                </button>
              </div>
            </div>
            {overrideLocked && (
              <div className="mt-3 text-xs text-rose-600 font-semibold bg-rose-50 rounded-lg px-3 py-2 border border-rose-200">
                ⚠️ 투표 마감 후에만 관리자 확정을 적용할 수 있습니다.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-gray-900">📝 투표 기록</div>
              {loading && <span className="text-xs text-gray-400">불러오는 중...</span>}
            </div>
            {sortedVotes.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
                아직 투표가 없습니다.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {sortedVotes.map((vote) => {
                  const player = rosterMap.get(vote.playerId)
                  return (
                    <div
                      key={vote.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 px-3 py-2 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <InitialAvatar id={vote.playerId} name={player?.name || vote.playerId} size={32} photoUrl={player?.photoUrl} />
                        <div>
                          <div className="text-sm font-semibold text-gray-900 notranslate" translate="no">{player?.name || vote.playerId}</div>
                          <div className="text-xs text-gray-500">{vote.voterLabel || '메모 없음'}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteVote(vote.id)}
                        className="text-xs font-bold text-rose-600 hover:text-rose-800 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                      >
                        삭제
                      </button>
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
