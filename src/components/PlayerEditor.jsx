// src/components/PlayerEditor.jsx
import React, { useEffect, useState } from 'react'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Trash2 } from 'lucide-react'
import { labelOf, STAT_KEYS } from '../lib/constants'
import { overall } from '../lib/players'
import { toRadarData } from '../lib/stats'
import { uploadPlayerPhoto, deletePlayerPhoto } from '../lib/photoUpload'
import { randomAvatarDataUrl } from '../utils/avatar'
import VerifiedBadge from './VerifiedBadge'
import InitialAvatar from './InitialAvatar'
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
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  
  useEffect(()=> { setP(player); setErrors({}) }, [player.id])

  function set(field, value){ setP(prev => ({...prev, [field]: value})) }
  function setStat(k, v){ setP(prev => ({...prev, stats: { ...prev.stats, [k]: v }})) }

  async function onPickPhoto(file){
    if(!file) return
    setUploading(true)
    try{
      const publicUrl = await uploadPlayerPhoto(file, p.id || 'temp', p.photoUrl)
      set('photoUrl', publicUrl)
      notify('사진이 업로드되었습니다.')
    } catch(err) {
      console.error(err)
      notify(err.message || '사진 업로드에 실패했습니다.', 'error')
    } finally {
      setUploading(false)
    }
  }
  
  function applyUrlInput(){
    if(!urlInput.trim()){
      notify('URL을 입력해주세요.', 'error')
      return
    }
    set('photoUrl', urlInput.trim())
    setUrlInput('')
    setShowUrlInput(false)
    notify('사진 URL이 적용되었습니다.')
  }
  
  async function resetToRandom(){
    // 기존 업로드된 사진이 있으면 버킷에서 삭제
    if(p.photoUrl && !p.photoUrl.startsWith('RANDOM:') && p.photoUrl.includes('player-photos')){
      try {
        await deletePlayerPhoto(p.photoUrl)
      } catch(err) {
        console.error('Failed to delete old photo:', err)
      }
    }
    
    // 랜덤 버튼 클릭 시 RANDOM: prefix와 랜덤 값으로 매번 다른 색상 생성
    const randomSeed = 'RANDOM:' + Date.now() + Math.random()
    set('photoUrl', randomSeed)
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
        <InitialAvatar 
          id={p.id} 
          name={p.name} 
          size={64} 
          photoUrl={p.photoUrl}
          badges={(() => { 
            const mem = String(p.membership || "").trim().toLowerCase(); 
            return (mem === 'member' || mem.includes('정회원')) ? [] : ['G'] 
          })()} 
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className={`cursor-pointer rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {uploading ? '업로드 중...' : '업로드'}
              <input hidden type="file" accept="image/*" onChange={(e)=> onPickPhoto(e.target.files?.[0] || null)} disabled={uploading} />
            </label>
            <button 
              className="text-sm text-gray-700 rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50" 
              onClick={()=>setShowUrlInput(!showUrlInput)}
              disabled={uploading}
            >
              URL
            </button>
            <button 
              className="text-sm text-gray-700 rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50" 
              onClick={resetToRandom}
              disabled={uploading}
            >
              랜덤
            </button>
          </div>
          
          {/* URL 입력 필드 */}
          {showUrlInput && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e)=>setUrlInput(e.target.value)}
                placeholder="https://...supabase.co/storage/v1/object/public/..."
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                onKeyDown={(e)=>e.key==='Enter' && applyUrlInput()}
              />
              <button 
                className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600"
                onClick={applyUrlInput}
              >
                적용
              </button>
              <button 
                className="text-sm text-gray-600 hover:text-gray-800"
                onClick={()=>{setShowUrlInput(false); setUrlInput('')}}
              >
                취소
              </button>
            </div>
          )}
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
