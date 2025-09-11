// src/App.jsx
import React, { useEffect, useMemo, useState } from "react"
import { Home, Users, CalendarDays } from "lucide-react"

// ⛔ localStorage 버전 제거
// import { loadDB, saveDB } from "./lib/storage"

import {
  listPlayers, upsertPlayer, deletePlayer, subscribePlayers,
  loadDB, saveDB, subscribeDB,
  // setRoomId, // 필요 시 룸 아이디 변경에 사용
} from "./services/storage.service"

import { mkPlayer } from "./lib/players"
import { notify } from "./components/Toast"

import ToastHub from "./components/Toast"
import Card from "./components/Card"

import Dashboard from "./pages/Dashboard"
import PlayersPage from "./pages/PlayersPage"
import MatchPlanner from "./pages/MatchPlanner"

export default function App() {
  const [tab, setTab] = useState("dashboard") // 'dashboard' | 'players' | 'planner'
  const [db, setDb] = useState({ players: [], matches: [] })
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)

  // (선택) 여러 방(룸) 운영 시 .env나 URL로 받아 setRoomId("your-room-id")
  // setRoomId('semihan-lite-room-1')

  // ✅ 최초 로드 + 실시간 구독
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const playersFromDB = await listPlayers()
        const shared = await loadDB() // { players:[], matches:[] }
        if (!mounted) return
        setDb({ players: playersFromDB, matches: shared.matches || [] })
      } catch (e) {
        console.error("[App] initial load failed", e)
      }
    })()

    const offPlayers = subscribePlayers((list) => {
      setDb(prev => ({ ...prev, players: list }))
    })
    const offDB = subscribeDB((next) => {
      setDb(prev => ({ ...prev, matches: next.matches || [] }))
    })

    return () => { mounted = false; offPlayers?.(); offDB?.() }
  }, [])

  const players = db.players || []
  const matches = db.matches || []

  // ✅ 대시보드 요약
  const totals = useMemo(() => {
    const cnt = players.length
    const goalsProxy = Math.round(
      players.reduce((a, p) => a + (p.stats?.Shooting || 0) * 0.1, 0)
    )
    const attendanceProxy = Math.round(60 + players.length * 2)
    return { count: cnt, goals: goalsProxy, attendance: attendanceProxy }
  }, [players])

  /* ---------------- 선수 핸들러 (Supabase) ---------------- */
  async function handleCreatePlayer() {
    const p = mkPlayer("새 선수", "MF")
    setDb(prev => ({ ...prev, players: [p, ...(prev.players || [])] })) // 낙관적
    setSelectedPlayerId(p.id)
    notify("새 선수를 추가했습니다.")
    try { await upsertPlayer(p) } catch (e) { console.error(e) }
  }

  async function handleUpdatePlayer(next) {
    setDb(prev => ({
      ...prev,
      players: (prev.players || []).map(x => x.id === next.id ? next : x),
    }))
    try { await upsertPlayer(next) } catch (e) { console.error(e) }
  }

  async function handleDeletePlayer(id) {
    setDb(prev => ({ ...prev, players: (prev.players || []).filter(p => p.id !== id) }))
    if (selectedPlayerId === id) setSelectedPlayerId(null)
    try { await deletePlayer(id); notify("선수를 삭제했습니다.") } catch (e) { console.error(e) }
  }

  function handleImportPlayers(list) {
    const safe = Array.isArray(list) ? list : []
    setDb(prev => ({ ...prev, players: safe }))
    Promise.all(safe.map(upsertPlayer))
      .then(() => notify("선수 목록을 가져왔습니다."))
      .catch(console.error)
    setSelectedPlayerId(null)
  }

  function handleResetPlayers() {
    ;(async () => {
      const fresh = await listPlayers()
      setDb(prev => ({ ...prev, players: fresh }))
      setSelectedPlayerId(null)
      notify("선수 목록을 리셋했습니다.")
    })()
  }

  /* ---------------- 매치 핸들러 (공유 JSON: appdb) ---------------- */
  function handleSaveMatch(match) {
    const next = [...(db.matches || []), match]
    setDb(prev => ({ ...prev, matches: next }))
    saveDB({ players: [], matches: next })
  }

  function handleDeleteMatch(id) {
    const next = (db.matches || []).filter(m => m.id !== id)
    setDb(prev => ({ ...prev, matches: next }))
    saveDB({ players: [], matches: next })
    notify("매치를 삭제했습니다.")
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 antialiased leading-relaxed">
      <ToastHub />

      {/* 헤더 */}
      <header className="sticky top-0 z-10 border-b border-stone-300 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-emerald-500" />
            <h1 className="text-base font-semibold tracking-tight">
              semihan-football-manager
            </h1>
          </div>
          <nav className="flex gap-1">
            <TabButton
              icon={<Home size={16} />}
              label="대시보드"
              onClick={() => setTab("dashboard")}
              active={tab === "dashboard"}
            />
            <TabButton
              icon={<Users size={16} />}
              label="선수 관리"
              onClick={() => setTab("players")}
              active={tab === "players"}
            />
            <TabButton
              icon={<CalendarDays size={16} />}
              label="매치 플래너"
              onClick={() => setTab("planner")}
              active={tab === "planner"}
            />
          </nav>
        </div>
      </header>

      {/* 본문 */}
      <main className="mx-auto max-w-6xl p-4">
        {tab === "dashboard" && (
          <Dashboard
            totals={totals}
            players={players}
            matches={matches}
            onCreate={handleCreatePlayer}
          />
        )}

        {tab === "players" && (
          <PlayersPage
            players={players}
            selectedId={selectedPlayerId}
            onSelect={setSelectedPlayerId}
            onCreate={handleCreatePlayer}
            onUpdate={handleUpdatePlayer}
            onDelete={handleDeletePlayer}
            onImport={handleImportPlayers}
            onReset={handleResetPlayers}
          />
        )}

        {tab === "planner" && (
          <MatchPlanner
            players={players}
            matches={matches}
            onSaveMatch={handleSaveMatch}
            onDeleteMatch={handleDeleteMatch}
          />
        )}
      </main>

      {/* 푸터 */}
      <footer className="mx-auto mt-10 max-w-6xl px-4 pb-8">
        <Card title="도움말">
          <ul className="list-disc pl-5 text-sm text-stone-600">
            <li>정회원은 자동으로 배지가 표시됩니다.</li>
            <li>선수 저장 시 이름/멤버십은 필수입니다.</li>
            <li>프로필은 이름 첫 글자 이니셜 아바타로 표시됩니다.</li>
            <li>매치 플래너에서 장소 프리셋 또는 자유 입력을 이용하세요.</li>
          </ul>
        </Card>
      </footer>
    </div>
  )
}

function TabButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition
        ${
          active
            ? "bg-emerald-500 text-white shadow-sm"
            : "text-stone-700 hover:bg-stone-200 active:bg-stone-300"
        }`}
      aria-pressed={active}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
