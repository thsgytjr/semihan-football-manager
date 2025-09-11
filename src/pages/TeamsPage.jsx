import React, { useEffect, useState } from 'react'
import Card from '../components/Card'
import TeamCard from '../components/TeamCard'
import { balanceTeams, scoreBy } from '../lib/teams'

export default function TeamsPage({ players }){
  const [criterion, setCriterion] = useState('overall')
  const [result, setResult] = useState(()=> balanceTeams(players, criterion))
  useEffect(()=> setResult(balanceTeams(players, criterion)), [players, criterion])

  const sumA = result.A.reduce((a,p)=>a+scoreBy(p,criterion),0)
  const sumB = result.B.reduce((a,p)=>a+scoreBy(p,criterion),0)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="배정 기준" right={
        <div className="flex items-center gap-2">
          <select className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" value={criterion} onChange={(e)=>setCriterion(e.target.value)}>
            <option value="overall">전체 능력치 균형</option>
            <option value="attack">공격(슛+드리블+패스)</option>
            <option value="physical">피지컬(피지컬+체력)</option>
            <option value="pace">스피드(Pace)</option>
          </select>
          <button className="rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-white" onClick={()=>setResult(balanceTeams(players, criterion))}>재배정</button>
        </div>
      }>
        <div className="text-sm text-gray-500">정렬 후 총합이 낮은 팀에 한 명씩 배치하는 간단한 그리디 알고리즘입니다.</div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <TeamCard name="A팀" list={result.A} total={sumA} criterion={criterion}/>
        <TeamCard name="B팀" list={result.B} total={sumB} criterion={criterion}/>
      </div>
    </div>
  )
}
