// src/components/PlayerEditor.jsx
import React, { useEffect, useState } from 'react'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Trash2 } from 'lucide-react'
import { labelOf, STAT_KEYS } from '../lib/constants'
import { overall } from '../lib/players'
import { toRadarData } from '../lib/stats'
import { readImageAsDataURL } from '../utils/io'
import { randomAvatarDataUrl } from '../utils/avatar'
import VerifiedBadge from './VerifiedBadge'
import Select from './Select'
import { notify } from './Toast'

const POSITION_OPTIONS = [
  { value:'FW', label:'FW (공격수)' },
  { value:'MF', label:'MF (미드필더)' },
  { value:'DF', label:'DF (수비수)' },
  { value:'GK', label:'GK (골키퍼)' },
]

export default function PlayerEditor({ player, onChange, onDelete }){
  const [p, setP] = useState(player)
  const [errors, setErrors] = useState({})
  useEffect(()=> { setP(player); setErrors({}) }, [player.id])

  function set(field, value){ setP(prev => ({...prev, [field]: value})) }
  function setStat(k, v){ setP(prev => ({...prev, stats: { ...prev.stats, [k]: v }})) }

  async function onPickPhoto(file){
    if(!file) return
    try{
      const dataUrl = await readImageAsDataURL(file, 256)
      set('photoUrl', dataUrl)
    }catch{ notify('이미지를 불러오지 못했어요.', 'error') }
  }
  function resetToRandom(){
    set('photoUrl', randomAvatarDataUrl(p.name || p.id, 128))
  }

  function validate(){
    const e = {}
    if(!p.name?.trim()) e.name = '이름은 필수입니다.'
    if(!p.membership || !['member','guest'].includes(p.membership)) e.membership = '멤버십을 선택해주세요.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function save(){
    if(!validate()){
      notify('필수 항목을 확인해주세요.', 'error')
      return
    }
    // photoUrl이 비어있다면 랜덤 아바타 자동 채움
    const payload = { ...p, photoUrl: p.photoUrl || randomAvatarDataUrl(p.name || p.id, 128) }
    onChange(payload)
    notify('선수 정보가 저장되었습니다.')
  }

  return (
    <div className="space-y-4">
      {/* 아바타 */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
          {p.photoUrl
            ? <img src={p.photoUrl} alt="avatar" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">{p.name?.[0] ?? '🙂'}</div>}
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer rounded border border-gray-300 bg-white px-3 py-1 text-sm">
            사진 업로드
            <input hidden type="file" accept="image/*" onChange={(e)=> onPickPhoto(e.target.files?.[0] || null)} />
          </label>
          <button className="text-sm text-gray-700 rounded border border-gray-300 bg-white px-3 py-1" onClick={resetToRandom}>랜덤 아바타</button>
          {p.photoUrl && <button className="text-sm text-red-600" onClick={()=>set('photoUrl', null)}>삭제</button>}
        </div>
      </div>

      {/* 이름 / 선호 포지션 / 멤버십 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-gray-700">이름<span className="text-red-500">*</span></label>
          <input
            className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
            value={p.name} onChange={(e)=>set('name', e.target.value)} placeholder="홍길동"
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <Select
          label="선호 포지션"
          value={p.position}
          onChange={(v)=>set('position', v)}
          options={POSITION_OPTIONS}
        />
        <div>
          <label className="mb-1 block text-sm text-gray-700">멤버십<span className="text-red-500">*</span></label>
          <select
            className={`w-full rounded-lg border px-3 py-2 text-sm ${errors.membership ? 'border-red-400' : 'border-gray-300'}`}
            value={p.membership || 'guest'} onChange={(e)=>set('membership', e.target.value)}
            title="정회원은 배지가 표시됩니다."
          >
            <option value="member">정회원</option>
            <option value="guest">게스트</option>
          </select>
          <div className="mt-1">
            <VerifiedBadge membership={p.membership} />
          </div>
          {errors.membership && <p className="mt-1 text-xs text-red-600">{errors.membership}</p>}
        </div>
      </div>

      {/* 스탯 */}
      <div className="grid grid-cols-1 gap-3">
        {STAT_KEYS.map(k => (
          <div key={k} className="grid grid-cols-[100px_1fr_48px] items-center gap-3">
            <label className="text-sm text-gray-700">{labelOf(k)}</label>
            <input type="range" min={0} max={100} value={p.stats[k]} onChange={(e)=>setStat(k, +e.target.value)} />
            <div className="text-right text-sm">{p.stats[k]}</div>
          </div>
        ))}
      </div>

      {/* 레이더 & 오버롤 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs text-gray-500">능력 레이더</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={toRadarData(p)} cx="50%" cy="50%" outerRadius="80%">
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 12 }} />
                <PolarRadiusAxis tick={{ fill: '#9ca3af', fontSize: 10 }} angle={30} domain={[0, 100]} />
                <Tooltip />
                <Radar name={p.name} dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">오버롤</div>
          <div className="text-4xl font-bold">{overall(p)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button className="rounded bg-emerald-500 px-4 py-2 font-semibold text-white" onClick={save}>저장</button>
        <button className="flex items-center gap-2 rounded bg-red-600 px-3 py-2 text-sm text-white" onClick={onDelete}>
          <Trash2 size={16}/>삭제
        </button>
      </div>
    </div>
  )
}
