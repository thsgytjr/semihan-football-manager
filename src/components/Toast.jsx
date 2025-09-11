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

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-2">
      {toasts.map(t => (
        <div key={t.id}
          className={`pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-md backdrop-blur
            ${t.type==='error'
              ? 'border-red-200 bg-red-50/90 text-red-800'
              : 'border-emerald-200 bg-emerald-50/90 text-emerald-800'}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// helper
export function notify(message, type='success', duration=2200){
  window.dispatchEvent(new CustomEvent('notify', { detail: { message, type, duration }}))
}
