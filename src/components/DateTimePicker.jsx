import React, { useEffect, useRef, useState } from 'react'

// Lightweight custom date-time picker using native date + time inputs in a popover.
// Props:
//  value: string ("YYYY-MM-DDTHH:MM")
//  onChange(newValue)
//  disabled?: boolean
//  isPast?: boolean (for error styling)
//  error?: string (optional error message)
//  label?: string
//  min?: string (min datetime-local string)
//  className?: extra container classes
export default function DateTimePicker({
  value,
  onChange,
  disabled=false,
  isPast=false,
  error=null,
  label='일시',
  min,
  className=''
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const popRef = useRef(null)
  const [localDate, setLocalDate] = useState('')
  const [localTime, setLocalTime] = useState('')

  // Parse incoming value
  useEffect(() => {
    if (!value) { setLocalDate(''); setLocalTime(''); return }
    const parts = value.split('T')
    if (parts.length === 2) {
      setLocalDate(parts[0])
      setLocalTime(parts[1].slice(0,5))
    }
  }, [value])

  // Close when clicking outside
  useEffect(() => {
    function handle(e){
      if(!open) return
      if(popRef.current && popRef.current.contains(e.target)) return
      if(anchorRef.current && anchorRef.current.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', handle)
    return ()=>window.removeEventListener('mousedown', handle)
  }, [open])

  function commit(nextDate, nextTime){
    if(!nextDate || !nextTime){
      onChange('')
      return
    }
    onChange(`${nextDate}T${nextTime}`)
  }

  function onDateChange(e){
    const d = e.target.value
    setLocalDate(d)
    commit(d, localTime)
  }
  function onTimeChange(e){
    const t = e.target.value
    setLocalTime(t)
    commit(localDate, t)
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={anchorRef}>
      {label && <div className="mb-1 text-[11px] font-semibold text-gray-600">{label}</div>}
      <button
        type="button"
        disabled={disabled}
        onClick={()=>setOpen(o=>!o)}
        className={`w-full rounded-md border px-3 py-2 text-sm flex items-center justify-between transition-colors ${disabled?"bg-gray-100 cursor-not-allowed":isPast?"border-red-400 bg-red-50 text-red-700":"border-gray-300 bg-white hover:bg-gray-50"}`}
      >
        <span className="truncate">
          {value ? value.replace('T',' ') : '날짜/시간 선택'}
        </span>
        <span className="ml-2 text-[10px] text-gray-500">{open? '▲':'▼'}</span>
      </button>
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {open && !disabled && (
        <div ref={popRef} className="z-30 absolute mt-2 w-64 rounded-lg border border-gray-300 bg-white shadow-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">날짜</span>
            <input
              type="date"
              value={localDate}
              onChange={onDateChange}
              min={min?.split('T')[0]}
              className="text-sm rounded border border-gray-300 px-2 py-1 w-[140px]"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">시간</span>
            <input
              type="time"
              value={localTime}
              onChange={onTimeChange}
              className="text-sm rounded border border-gray-300 px-2 py-1 w-[100px]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={()=>{ setOpen(false) }}
              className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
            >닫기</button>
            <button
              type="button"
              onClick={()=>{ commit(localDate, localTime); setOpen(false) }}
              className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            >확인</button>
          </div>
        </div>
      )}
    </div>
  )
}
