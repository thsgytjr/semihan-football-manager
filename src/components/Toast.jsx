// src/components/Toast.jsx
import React, { useEffect, useState, useRef } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'

const EXIT_ANIMATION_MS = 320
const MIN_REMAIN_MS = 400

export default function ToastHub() {
  const [toasts, setToasts] = useState([])
  const timeoutsRef = useRef({})
  const remainingRef = useRef({})
  const expiresRef = useRef({})

  const scheduleRemoval = (id, delayMs) => {
    if (timeoutsRef.current[id]) clearTimeout(timeoutsRef.current[id])
    timeoutsRef.current[id] = setTimeout(() => removeToast(id), delayMs)
    remainingRef.current[id] = delayMs
    expiresRef.current[id] = Date.now() + delayMs
  }

  const removeToast = (id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, isExiting: true } : t))
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id])
      delete timeoutsRef.current[id]
    }
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id))
      delete timeoutsRef.current[id]
      delete remainingRef.current[id]
      delete expiresRef.current[id]
    }, EXIT_ANIMATION_MS)
  }

  const dismissToast = (id) => {
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id])
      delete timeoutsRef.current[id]
    }
    removeToast(id)
  }

  const handleMouseEnter = (id) => {
    if (timeoutsRef.current[id]) {
      const remaining = Math.max((expiresRef.current[id] ?? 0) - Date.now(), MIN_REMAIN_MS)
      remainingRef.current[id] = remaining
      clearTimeout(timeoutsRef.current[id])
      delete timeoutsRef.current[id]
    }
  }

  const handleMouseLeave = (id) => {
    const remaining = remainingRef.current[id] ?? MIN_REMAIN_MS
    scheduleRemoval(id, remaining)
  }

  useEffect(() => {
    function onNotify(e){
      const msg = e.detail?.message || String(e.detail || '저장되었습니다')
      const type = e.detail?.type || 'success'
      const duration = e.detail?.duration ?? 2200

      setToasts(prev => {
        const isDuplicate = prev.some(t => t.msg === msg && t.type === type)
        if (isDuplicate) return prev

        const id = crypto.randomUUID?.() || String(Date.now())
        const t = { id, msg, type, isExiting: false }

        scheduleRemoval(id, duration)
        return [...prev, t]
      })
    }

    window.addEventListener('notify', onNotify)
    return () => {
      window.removeEventListener('notify', onNotify)
      Object.values(timeoutsRef.current).forEach(clearTimeout)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed left-0 right-0 z-[350] flex flex-col items-center gap-3 px-2" style={{ top: '60px' }}>
      {toasts.map(t => {
        const config = getToastConfig(t.type)
        const Icon = config.icon

        return (
          <div
            key={t.id}
            onMouseEnter={() => handleMouseEnter(t.id)}
            onMouseLeave={() => handleMouseLeave(t.id)}
            className={`pointer-events-auto w-full max-w-md rounded-2xl border-2 shadow-2xl backdrop-blur-md px-5 py-4 flex items-center gap-3 transform hover:scale-105 ${config.className} ${
              t.isExiting ? 'toast-exit' : 'toast-enter'
            }`}
            style={{
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div className="shrink-0 relative">
              <div className="absolute inset-0 blur-lg opacity-50" style={{
                background: config.iconClassName.includes('emerald') ? '#10b981' :
                           config.iconClassName.includes('red') ? '#ef4444' :
                           config.iconClassName.includes('amber') ? '#f59e0b' : '#3b82f6'
              }} />
              <Icon className={`relative w-6 h-6 ${config.iconClassName} drop-shadow-lg`} strokeWidth={2.5} />
            </div>
            <span className="flex-1 text-sm font-semibold tracking-wide">{t.msg}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className={`shrink-0 rounded-full p-1.5 transition-all hover:rotate-90 hover:scale-110 ${config.closeHoverClassName}`}
              aria-label="닫기"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function getToastConfig(type) {
  switch(type) {
    case 'error':
      return {
        icon: XCircle,
        className: 'bg-gradient-to-r from-red-50 to-red-100/80 border-red-300 text-red-900',
        iconClassName: 'text-red-500',
        closeHoverClassName: 'hover:bg-red-200/50'
      }
    case 'warning':
      return {
        icon: AlertTriangle,
        className: 'bg-gradient-to-r from-amber-50 to-amber-100/80 border-amber-300 text-amber-900',
        iconClassName: 'text-amber-500',
        closeHoverClassName: 'hover:bg-amber-200/50'
      }
    case 'info':
      return {
        icon: Info,
        className: 'bg-gradient-to-r from-blue-50 to-blue-100/80 border-blue-300 text-blue-900',
        iconClassName: 'text-blue-500',
        closeHoverClassName: 'hover:bg-blue-200/50'
      }
    default:
      return {
        icon: CheckCircle,
        className: 'bg-gradient-to-r from-emerald-50 to-emerald-100/80 border-emerald-300 text-emerald-900',
        iconClassName: 'text-emerald-500',
        closeHoverClassName: 'hover:bg-emerald-200/50'
      }
  }
}

export function notify(message, type='success', duration=2200){
  window.dispatchEvent(new CustomEvent('notify', { detail: { message, type, duration }}))
}
