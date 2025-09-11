// src/pages/Dashboard.jsx
import React, { useMemo } from 'react'
import Card from '../components/Card'
import Stat from '../components/Stat'
import {
  attendanceSeries,
  recentAttendanceSummary,
  topAttendance,
  lowAttendance,
  positionComposition,
  teamOverallSummary,
  recentMatches,
} from '../lib/analytics'
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { overall } from '../lib/players'

const PIE_COLORS = ["#10b981","#60a5fa","#f59e0b","#ef4444","#8b5cf6","#22c55e"]

export default function Dashboard({ totals, players, onCreate }) {
  // matches는 App에서 읽어와 이 컴포넌트로 넘기지 않았다면, storage에서 직접 읽어도 됨.
  // 권장: App.jsx에서 <Dashboard players={players} matches={matches} .../>로 전달하세요.
  const matches = window.__SEMihanMatches__ ?? [] // fallback: 없으면 빈 배열
  // ↑ 이미 App에서 전달 중이면 이 줄은 제거해도 무방합니다.

  const series = useMemo(()=> attendanceSeries(matches), [matches])
  const recent = useMemo(()=> recentAttendanceSummary(matches, 4), [matches])
  const top5 = useMemo(()=> topAttendance(players, matches, 5), [players, matches])
  const low5 = useMemo(()=> lowAttendance(players, matches, 5), [players, matches])
  const posPie = useMemo(()=> positionComposition(players), [players])
  const ovrSum = useMemo(()=> teamOverallSummary(players), [players])
  const lastMatches = useMemo(()=> recentMatches(matches, 3), [matches])

  const totalPlayers = players.length
  const avgOVR = ovrSum.avgOVR
  const medianOVR = ovrSum.medianOVR
  const avgAttendance = recent.avg
  const suggested = recent.suggested // { mode, teams }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* 상단 KPI */}
      <Card title="요약">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="총 선수" value={`${totalPlayers}명`} />
          <Stat label="팀 평균 OVR" value={avgOVR} />
          <Stat label="팀 중앙값 OVR" value={medianOVR} />
          <Stat label="최근 4경기 평균 참석" value={`${avgAttendance}명`} />
        </div>
        <div className="mt-3 text-sm text-gray-600">
          최근 4경기 기준 추천: <b>{suggested.mode}</b> · <b>{suggested.teams}팀</b>
        </div>
      </Card>

      {/* 참석 추이 라인차트 */}
      <Card title="참석 추이">
        {series.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="attendees" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-gray-500">저장된 매치가 없어 추이를 표시할 수 없습니다.</div>
        )}
      </Card>

      {/* 상위 출석률 / 하위 출석률 바차트 */}
      <Card title="상위 출석률 (Top 5)">
        {top5.length ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-gray-500">출석 데이터가 충분하지 않습니다.</div>
        )}
      </Card>

      <Card title="하위 출석률 (Bottom 5)">
        {low5.length ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={low5} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="rate" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-gray-500">출석 데이터가 충분하지 않습니다.</div>
        )}
      </Card>

      {/* 포지션 구성 파이차트 */}
      <Card title="포지션 구성">
        {posPie.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={posPie} dataKey="value" nameKey="name" outerRadius={90} label>
                  {posPie.map((entry, index) => <Cell key={`c-${index}`} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-gray-500">선수 데이터가 없습니다.</div>
        )}
      </Card>

      {/* 최근 매치 카드 */}
      <Card title="최근 매치">
        {lastMatches.length ? (
          <ul className="space-y-2">
            {lastMatches.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
                <div className="text-sm">
                  <b>{m.date}</b> · {m.mode} · {m.teams}팀 · 참석 {m.attendees}명
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">최근 저장된 매치가 없습니다.</div>
        )}
      </Card>

      {/* OVR 상위 5명 간단 리스트 */}
      <Card title="OVR 상위 5명">
        {players.length ? (
          <ul className="space-y-2">
            {[...players].sort((a,b)=> overall(b)-overall(a)).slice(0,5).map((p, i)=>(
              <li key={p.id} className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 font-semibold">#{i+1}</span>
                  <span>{p.name}</span>
                  <span className="text-xs text-gray-500">({p.position})</span>
                </div>
                <b>{overall(p)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">선수 데이터를 추가하세요.</div>
        )}
      </Card>
    </div>
  )
}
