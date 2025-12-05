import React from 'react'
import { createPortal } from 'react-dom'

export default function ConfirmDialog({
  open,
  title = '확인',
  message = '',
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'danger', // 'danger' | 'default'
  onConfirm,
  onCancel,
  children,
}) {
  if (!open) return null

  const toneClasses = tone === 'danger'
    ? {
        iconBg: 'bg-rose-100',
        iconColor: 'text-rose-600',
        confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
      }
    : {
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
      }

  const showCancel = !!onCancel && cancelLabel !== null && cancelLabel !== undefined

  const handleBackdrop = (e) => {
    e.stopPropagation()
    if (showCancel) onCancel()
    else onConfirm?.()
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={handleBackdrop}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full ${toneClasses.iconBg} flex items-center justify-center flex-shrink-0`}>
            <svg className={`w-6 h-6 ${toneClasses.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-stone-900">{title}</h3>
            <p className="text-sm text-stone-500">이 작업은 되돌릴 수 없습니다</p>
          </div>
        </div>
        {(message || children) && (
          <div className="mb-6 space-y-3">
            {message && (
              <p className="text-sm text-stone-700 bg-stone-50 p-3 rounded-lg whitespace-pre-line">{message}</p>
            )}
            {children}
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          {showCancel && (
            <button 
              onClick={onCancel} 
              className="px-4 py-2.5 rounded-lg border-2 border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button 
            onClick={onConfirm} 
            className={`px-4 py-2.5 rounded-lg transition-colors shadow-sm ${toneClasses.confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
