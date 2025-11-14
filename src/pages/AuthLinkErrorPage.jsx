// src/pages/AuthLinkErrorPage.jsx
import React from 'react'
import { AlertTriangle, Home, LogIn } from 'lucide-react'
import { TEAM_CONFIG } from '../lib/teamConfig'

export default function AuthLinkErrorPage({ error, errorCode, description, onHome, onLogin }){
  const title = errorCode === 'otp_expired' ? '초대/로그인 링크가 만료되었습니다' : '인증 링크에 문제가 있습니다'
  const help = errorCode === 'otp_expired'
    ? '이메일 링크는 한 번만 사용 가능하거나 일정 시간 후 만료됩니다. 관리자가 새 초대장을 보내도록 요청하거나, 다시 로그인 링크를 받아주세요.'
    : '링크가 올바른지 확인하고 다시 시도하세요.'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-orange-50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle size={28} />
        </div>
        <h1 className="text-xl font-bold text-stone-900 text-center">{title}</h1>
        <p className="mt-2 text-sm text-stone-600 text-center">{help}</p>

        <div className="mt-4 rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600">
          <div><span className="font-semibold">에러 코드:</span> {errorCode || error || 'unknown'}</div>
          {description && (
            <div className="mt-1 break-words"><span className="font-semibold">설명:</span> {decodeURIComponent(description)}</div>
          )}
          <div className="mt-1"><span className="font-semibold">팀:</span> {TEAM_CONFIG.name}</div>
        </div>

        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={onHome}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
          >
            <Home size={16}/> 홈으로 이동
          </button>
          {onLogin && (
            <button
              onClick={onLogin}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
            >
              <LogIn size={16}/> 로그인 열기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
