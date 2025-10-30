import React from 'react'
import TabButton from './TabButton'
import { Home, Users, Shuffle, BarChart3, CalendarCheck2 } from 'lucide-react'

export default function Header({ tab, setTab }){
  return (
    <header className="sticky top-0 z-[200] border-b border-gray-200 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-emerald-500" />
          <h1 className="text-lg font-semibold">Semihan Soccer Lite</h1>
        </div>
        <nav className="flex gap-1">
          <TabButton icon={<Home size={16} />} label="대시보드" active={tab==='dashboard'} onClick={()=>setTab('dashboard')} />
          <TabButton icon={<Users size={16} />} label="선수 관리" active={tab==='players'} onClick={()=>setTab('players')} />
          <TabButton icon={<Shuffle size={16} />} label="팀 배정" active={tab==='teams'} onClick={()=>setTab('teams')} />
          <TabButton icon={<BarChart3 size={16} />} label="통계" active={tab==='stats'} onClick={()=>setTab('stats')} />
          <TabButton icon={<CalendarCheck2 size={16} />} label="매치 플래너" active={tab==='planner'} onClick={()=>setTab('planner')} />
        </nav>
      </div>
    </header>
  )
}
