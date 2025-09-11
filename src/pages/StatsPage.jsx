import React, { useMemo, useState } from 'react'
import Card from '../components/Card'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { avgStats, mergeRadar } from '../lib/stats'
import { overall } from '../lib/players'

export default function StatsPage({ players }){
  const teamAvg = useMemo(()=> avgStats(players), [players])
  const [pick, setPick] = useState(players[0]?.id || null)
  const current = players.find(p=>p.id===pick) || players[0] || null
  const radarData = current ? mergeRadar(teamAvg, current) : []

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="팀 평균 vs 선수 레이더">
        {current ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <PolarRadiusAxis tick={{ fill: '#9ca3af', fontSize: 10 }} angle={30} domain={[0,100]} />
                <Tooltip />
                <Radar name="팀 평균" dataKey="team" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.25} />
                <Radar name={current.name} dataKey="player" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-gray-500">선수 데이터를 추가하세요.</div>
        )}
      </Card>

      <Card title="선수 선택">
        <div className="grid grid-cols-2 gap-2">
          {players.map(p => (
            <button key={p.id} onClick={()=>setPick(p.id)} className={`rounded border px-3 py-2 text-left ${pick===p.id? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-gray-500">OVR {overall(p)} · {p.position}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
