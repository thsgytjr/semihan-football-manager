// src/App.jsx
import React, { useEffect, useMemo, useState } from "react"
import { Home, Users, CalendarDays } from "lucide-react"

import { loadDB, saveDB } from "./lib/storage"
import { mkPlayer } from "./lib/players"
import { notify } from "./components/Toast"

import ToastHub from "./components/Toast"
import Card from "./components/Card"

import Dashboard from "./pages/Dashboard"
import PlayersPage from "./pages/PlayersPage"
import MatchPlanner from "./pages/MatchPlanner"

export default function App() {
  const [tab, setTab] = useState("dashboard") // 'dashboard' | 'players' | 'planner'
  const [db, setDb] = useState(loadDB())
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)

  // ✅ localStorage에 저장
  useEffect(() => saveDB(db), [db])

  const players = db.players || []
  const matches = db.matches || []

  // ✅ 요약 계산
  const totals = useMemo(() => {
    const cnt = players.length
    const goalsProxy = Math.round(
      players.reduce((a, p) => a + (p.stats?.Shooting || 0) * 0.1, 0)
    )
    const attendanceProxy = Math.round(60 + players.length * 2)
    return { count: cnt, goals: goalsProxy, attendance: attendanceProxy }
  }, [players])

  /* ---------------- 선수 관련 핸들러 ---------------- */
  function handleCreatePlayer() {
    const p = mkPlayer("새 선수", "MF")
    setDb((prev) => ({ ...prev, players: [p, ...players] }))
    setSelectedPlayerId(p.id)
    notify("새 선수를 추가했습니다.")
  }

  function handleUpdatePlayer(next) {
    setDb((prev) => ({
      ...prev,
      players: prev.players.map((x) => (x.id === next.id ? next : x)),
    }))
  }

  function handleDeletePlayer(id) {
    setDb((prev) => ({ ...prev, players: prev.players.filter((p) => p.id !== id) }))
    if (selectedPlayerId === id) setSelectedPlayerId(null)
    // 삭제 알림은 PlayersPage에서 처리
  }

  function handleImportPlayers(list) {
    setDb((prev) => ({ ...prev, players: Array.isArray(list) ? list : prev.players }))
    setSelectedPlayerId(null)
    notify("선수 목록을 가져왔습니다.")
  }

  function handleResetPlayers() {
    const fresh = loadDB()
    setDb((prev) => ({ ...prev, players: fresh.players }))
    setSelectedPlayerId(null)
    notify("선수 목록을 리셋했습니다.")
  }

  /* ---------------- 매치 관련 핸들러 ---------------- */
  function handleSaveMatch(match) {
    setDb((prev) => ({ ...prev, matches: [...matches, match] }))
  }

  function handleDeleteMatch(id) {
    setDb((prev) => ({ ...prev, matches: prev.matches.filter((m) => m.id !== id) }))
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
            <li>
              매치 플래너에서 장소를 선택하거나 커스텀 입력 후 “구글 맵에서 열기”로
              확인하세요.
            </li>
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
