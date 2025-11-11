// src/components/Select.jsx  — 세련된 커스텀 드랍다운 (기본 키보드/스크린리더 가능)
import React, { useEffect, useId, useRef, useState } from 'react'

export default function Select({ value, onChange, options, placeholder='선택', className='', labelClassName='', id, label, size='md' }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const listRef = useRef(null)
  const uid = useId()
  const sel = options.find(o=>o.value===value)
  const isSm = size === 'sm'

  useEffect(()=>{
    function onDoc(e){ if(!btnRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return ()=> document.removeEventListener('mousedown', onDoc)
  },[])

  function onKey(e){
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setOpen(v=>!v) }
    if(e.key==='Escape'){ setOpen(false) }
  }

  return (
    <div className={`relative ${className}`}>
      {label && <label htmlFor={id||uid} className={`mb-1 block text-sm text-gray-700 ${labelClassName}`}>{label}</label>}
      <button
        id={id||uid}
        ref={btnRef}
        type="button"
        onClick={()=>setOpen(v=>!v)}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between ${isSm ? 'rounded-md px-2.5 py-1.5 text-xs' : 'rounded-lg px-3 py-2 text-sm'} border border-gray-300 bg-white text-left shadow-sm transition hover:border-gray-400 focus:outline-none`}
      >
        <span className={sel ? '' : 'text-gray-400'}>
          {sel ? sel.label : placeholder}
        </span>
        <svg width={isSm?14:16} height={isSm?14:16} viewBox="0 0 24 24" aria-hidden className="opacity-70"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          tabIndex={-1}
          role="listbox"
          className={`absolute z-20 mt-1 max-h-60 w-full overflow-auto ${isSm ? 'rounded-md' : 'rounded-lg'} border border-gray-200 bg-white p-1 ${isSm ? 'text-xs' : 'text-sm'} shadow-lg`}
        >
          {options.map(opt=>(
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value===value}
              onClick={()=>{ onChange?.(opt.value); setOpen(false) }}
              className={`flex cursor-pointer items-center justify-between rounded-md ${isSm ? 'px-2 py-1.5' : 'px-3 py-2'} hover:bg-gray-50 ${opt.value===value ? 'bg-emerald-50 text-emerald-700' : ''}`}
              title={opt.title || ''}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value===value && <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.2l-3.5-3.5L4 14.2l5 5L20 8.2 18.3 6.5z"/></svg>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
