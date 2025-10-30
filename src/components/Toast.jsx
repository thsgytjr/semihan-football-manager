// src/components/Toast.jsx
import React, { useEffect, useState } from 'react'

export default function ToastHub() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function onNotify(e){
      const id = crypto.randomUUID?.() || String(Date.now())
      const t = { id, msg: e.detail?.message || String(e.detail || '저장되었습니다'), type: e.detail?.type || 'success' }
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), e.detail?.duration ?? 2200)
    }
    window.addEventListener('notify', onNotify)
    return () => window.removeEventListener('notify', onNotify)
  }, [])

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(x => x.id !== id))
  }

  return (
    <div className="pointer-events-none fixed left-0 right-0 z-[250] flex flex-col items-center gap-2 px-2" style={{ top: '60px' }}>
      {toasts.map(t => (
        <div key={t.id}
          className={`pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-lg backdrop-blur flex items-center justify-between gap-3
            ${t.type==='error'
              ? 'border-red-200 bg-red-50/95 text-red-800'
              : 'border-emerald-200 bg-emerald-50/95 text-emerald-800'}`}>
          <span className="flex-1">{t.msg}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className={`shrink-0 rounded p-1 transition-colors ${
              t.type === 'error' 
                ? 'hover:bg-red-100' 
                : 'hover:bg-emerald-100'
            }`}
            aria-label="닫기"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

// helper
export function notify(message, type='success', duration=2200){
  window.dispatchEvent(new CustomEvent('notify', { detail: { message, type, duration }}))
}
