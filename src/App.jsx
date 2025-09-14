// src/App.jsx
import React, { useEffect, useMemo, useState } from "react"
import { Home, Users, CalendarDays, ListChecks } from "lucide-react"

import {
  listPlayers, upsertPlayer, deletePlayer, subscribePlayers,
  loadDB, saveDB, subscribeDB,
} from "./services/storage.service"

import { mkPlayer } from "./lib/players"
import { notify } from "./components/Toast"

import ToastHub from "./components/Toast"
import Card from "./components/Card"

import Dashboard from "./pages/Dashboard"
import PlayersPage from "./pages/PlayersPage"
import MatchPlanner from "./pages/MatchPlanner"
import StatsInput from "./pages/StatsInput"   // ⬅️ 새 탭

// ✅ 간편 Admin(공유 비밀번호) — 로컬 저장
const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASSWORD || "letmein"

export default function App() {
  const [tab, setTab] = useState("dashboard") // 'dashboard' | 'players' | 'planner' | 'stats'
  const [db, setDb] = useState({ players: [], matches: [] })
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("isAdmin") === "1")

  function adminLogin() {
    const input = prompt("Admin 비밀번호를 입력하세요")
    if (!input) return
    if (input === ADMIN_PASS) {
      localStorage.setItem("isAdmin", "1")
      setIsAdmin(true)
      notify("Admin 모드 활성화")
    } else {
      notify("비밀번호가 올바르지 않습니다.")
    }
  }
  function adminLogout() {
    localStorage.removeItem("isAdmin")
    setIsAdmin(false)
    notify("Admin 모드 해제")
  }

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

  // ✅ 대시보드 요약(간단)
  const totals = useMemo(() => {
    const cnt = players.length
    const goalsProxy = Math.round(players.reduce((a, p) => a + (p.stats?.Shooting || 0) * 0.1, 0))
    const attendanceProxy = Math.round(60 + players.length * 2)
    return { count: cnt, goals: goalsProxy, attendance: attendanceProxy }
  }, [players])

  /* ---------------- 선수 핸들러 ---------------- */
  async function handleCreatePlayer() {
    if (!isAdmin) return notify("Admin만 가능합니다.")
    const p = mkPlayer("새 선수", "MF")
    setDb(prev => ({ ...prev, players: [p, ...(prev.players || [])] })) // 낙관적
    setSelectedPlayerId(p.id)
    notify("새 선수를 추가했습니다.")
    try { await upsertPlayer(p) } catch (e) { console.error(e) }
  }

  async function handleUpdatePlayer(next) {
    if (!isAdmin) return notify("Admin만 가능합니다.")
    setDb(prev => ({
      ...prev,
      players: (prev.players || []).map(x => x.id === next.id ? next : x),
    }))
    try { await upsertPlayer(next) } catch (e) { console.error(e) }
  }

  async function handleDeletePlayer(id) {
    if (!isAdmin) return notify("Admin만 가능합니다.")
    setDb(prev => ({ ...prev, players: (prev.players || []).filter(p => p.id !== id) }))
    if (selectedPlayerId === id) setSelectedPlayerId(null)
    try { await deletePlayer(id); notify("선수를 삭제했습니다.") } catch (e) { console.error(e) }
  }

  function handleImportPlayers(list) {
    if (!isAdmin) return notify("Admin만 가능합니다.")
    const safe = Array.isArray(list) ? list : []
    setDb(prev => ({ ...prev, players: safe }))
    Promise.all(safe.map(upsertPlayer))
      .then(() => notify("선수 목록을 가져왔습니다."))
      .catch(console.error)
    setSelectedPlayerId(null)
  }

  function handleResetPlayers() {
    if (!isAdmin) return notify("Admin만 가능합니다.")
    ;(async () => {
      const fresh = await listPlayers()
      setDb(prev => ({ ...prev, players: fresh }))
      setSelectedPlayerId(null)
      notify("선수 목록을 리셋했습니다.")
    })()
  }

  /* ---------------- 매치 핸들러 (공유 JSON: appdb) ---------------- */
  function handleSaveMatch(match) {
    if (!isAdmin) return notify("Admin만 가능합니다.")
    const next = [...(db.matches || []), match]
    setDb(prev => ({ ...prev, matches: next }))
    saveDB({ players: [], matches: next })
  }

  function handleDeleteMatch(id) {
    if (!isAdmin) return notify("Admin만 가능합니다.")
    const next = (db.matches || []).filter(m => m.id !== id)
    setDb(prev => ({ ...prev, matches: next }))
    saveDB({ players: [], matches: next })
    notify("매치를 삭제했습니다.")
  }

  // ✅ 저장된 매치 업데이트(포메이션/좌표/경기기록 재저장)
  function handleUpdateMatch(id, patch) {
    const next = (db.matches || []).map(m =>
      m.id === id ? { ...m, ...patch } : m
    )
    setDb(prev => ({ ...prev, matches: next }))
    saveDB({ players: [], matches: next })
    notify("업데이트되었습니다.")
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 antialiased leading-relaxed">
      <ToastHub />

      {/* 헤더 */}
      <header className="sticky top-0 z-10 border-b border-stone-300 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img 
              src="/src/assets/semihan-football-manager-logo.png" 
              alt="Semihan Football Manager Logo" 
              className="h-7 w-7 object-contain"
            />
            <h1 className="text-base font-semibold tracking-tight">
              semihan-football-manager
            </h1>
          </div>
          <nav className="flex gap-1 items-center">
            <TabButton
              icon={<Home size={16} />}
              label="대시보드"
              onClick={() => setTab("dashboard")}
              active={tab === "dashboard"}
            />
            {isAdmin && (
              <TabButton
                icon={<Users size={16} />}
                label="선수 관리"
                onClick={() => setTab("players")}
                active={tab === "players"}
              />
            )}
            {isAdmin && (
              <TabButton
                icon={<CalendarDays size={16} />}
                label="매치 플래너"
                onClick={() => setTab("planner")}
                active={tab === "planner"}
              />
            )}
            {isAdmin && (
              <TabButton
                icon={<ListChecks size={16} />}
                label="기록 입력"
                onClick={() => setTab("stats")}
                active={tab === "stats"}
              />
            )}
            <div className="ml-2 pl-2 border-l border-stone-300">
              {isAdmin ? (
                <button onClick={adminLogout} className="rounded px-3 py-1.5 text-sm bg-stone-900 text-white">
                  Admin 로그아웃
                </button>
              ) : (
                <button onClick={adminLogin} className="rounded px-3 py-1.5 text-sm border border-stone-300 bg-white">
                  Admin 로그인
                </button>
              )}
            </div>
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
            isAdmin={isAdmin}
            onUpdateMatch={handleUpdateMatch}
          />
        )}

        {tab === "players" && isAdmin && (
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

        {tab === "planner" && isAdmin && (
          <MatchPlanner
            players={players}
            matches={matches}
            onSaveMatch={handleSaveMatch}
            onDeleteMatch={handleDeleteMatch}
            onUpdateMatch={handleUpdateMatch}
            isAdmin={isAdmin}
          />
        )}

        {tab === "stats" && isAdmin && (
          <StatsInput
            players={players}
            matches={matches}
            onUpdateMatch={handleUpdateMatch}
            isAdmin={isAdmin}
          />
        )}
      </main>

      {/* 푸터 */}
      <footer className="mx-auto mt-10 max-w-6xl px-4 pb-8">
        <Card title="도움말">
          <ul className="list-disc pl-5 text-sm text-stone-600">
            <li>대시보드: 저장된 매치 열람, 공격포인트(골/어시/경기수) 트래킹</li>
            <li>매치 플래너: 팀 배정, 포메이션 설정 (Admin)</li>
            <li>기록 입력: 경기별 골/어시 기록 입력/수정 (Admin)</li>
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
