// src/components/AdminLoginDialog.jsx
import React, { useEffect, useRef, useState } from "react"
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, X, UserCircle } from "lucide-react"
import { logger } from "../lib/logger"
import { TEAM_CONFIG } from "../lib/teamConfig"

/**
 * Mock 인증 사용 여부 확인
 * - localhost에서는 기본적으로 mock 사용 (빠른 개발)
 * - localhost/?nomock 에서는 실제 Supabase 인증 사용 (프로덕션 데이터 테스트)
 */
function shouldUseMockAuth() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (!isLocalhost) return false
  
  const url = new URL(window.location.href)
  const hasNoMockParam = url.searchParams.has('nomock')
  
  return !hasNoMockParam
}

export default function AdminLoginDialog({
  isOpen,
  onClose,
  onSuccess,
  adminPass, // required: 실제 검증에 사용
}) {
  const [email, setEmail] = useState("")
  const [pw, setPw] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState("")
  const [caps, setCaps] = useState(false)
  const [loading, setLoading] = useState(false)
  const emailInputRef = useRef(null)
  const pwInputRef = useRef(null)
  
  // localhost에서는 기본적으로 빠른 로그인 (MSW 전용)
  // localhost/?nomock 에서는 실제 Supabase 인증
  const useMockAuth = shouldUseMockAuth()

  useEffect(() => {
    if (isOpen) {
      setEmail("")
      setPw("")
      setErr("")
      setCaps(false)
      setLoading(false)
      
      // Mock auth 모드에서는 자동 로그인 (포커스 불필요)
      if (!useMockAuth) {
        setTimeout(() => emailInputRef.current?.focus(), 50)
      }
    }
  }, [isOpen, useMockAuth])

  function handleKey(e) {
    if (e.getModifierState?.("CapsLock")) setCaps(true)
    else setCaps(false)
    if (e.key === "Enter") submit()
  }

  async function submit() {
    if (loading) return
    setLoading(true)
    setErr("")
    
    try {
      // Mock auth 모드: 비밀번호 검증 없이 즉시 로그인 (MSW 전용)
      if (useMockAuth) {
        logger.log('[AdminLoginDialog] Mock auth mode: instant login')
        const success = await onSuccess("dev@localhost", "")
        if (success) {
          setLoading(false)
        } else {
          setErr("로그인에 실패했습니다.")
          setLoading(false)
        }
      } else {
        // 실제 Supabase 인증 모드: 이메일과 비밀번호 검증
        if (!email) {
          setErr("이메일을 입력하세요.")
          setLoading(false)
          return
        }
        
        if (!pw) {
          setErr("비밀번호를 입력하세요.")
          setLoading(false)
          return
        }
        
        logger.log('[AdminLoginDialog] Real auth mode: validating credentials')
        const success = await onSuccess(email, pw)
        if (success) {
          setLoading(false)
        } else {
          setErr("로그인에 실패했습니다.")
          setLoading(false)
        }
      }
    } catch (error) {
      logger.error('Login error:', error)
      setErr("로그인 중 오류가 발생했습니다.")
      setLoading(false)
    }
  }
  
  // 샌드박스 게스트 로그인 (앱 설정 접근용)
  async function submitAsSandboxGuest() {
    if (loading) return
    setLoading(true)
    setErr("")
    
    try {
      logger.log('[AdminLoginDialog] Sandbox guest login')
      const success = await onSuccess("sandbox@guest.local", "guest")
      if (success) {
        setLoading(false)
      } else {
        setErr("샌드박스 로그인에 실패했습니다.")
        setLoading(false)
      }
    } catch (error) {
      logger.error('Sandbox guest login error:', error)
      setErr("샌드박스 로그인 중 오류가 발생했습니다.")
      setLoading(false)
    }
  }

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-stone-200 bg-white shadow-xl">
        {/* 헤더 */}
        <button
          className="absolute right-3 top-3 rounded-md p-1 text-stone-500 hover:bg-stone-100"
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold">Admin 로그인</h3>
            <p className="text-xs text-stone-500">관리자 전용 기능을 사용하려면 인증하세요.</p>
          </div>
        </div>

        {/* 본문 */}
        <div className="space-y-3 px-5 py-4">
          {useMockAuth && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 border border-blue-200">
              🚀 개발 모드 (MSW 전용): 자물쇠 버튼을 누르면 즉시 로그인됩니다.<br/>
              <span className="text-blue-600">실제 인증 테스트: <code>localhost:5173/?nomock</code></span>
            </div>
          )}
          
          {TEAM_CONFIG.sandboxMode && !useMockAuth && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-200">
              📦 샌드박스 모드: <strong>샌드박스 유저로 로그인</strong>하면 모든 기능을 체험할 수 있습니다.<br/>
              <span className="text-amber-700">모든 변경 사항은 브라우저 세션에만 저장되며, 새로고침/탭 종료 시 초기화됩니다. 실제 데이터베이스에는 기록되지 않습니다.</span>
            </div>
          )}
          
          {/* Admin 로그인 폼 (항상 표시) */}
          {!useMockAuth && (
            <>
              <label className="block text-xs font-medium text-stone-600">이메일</label>
              <div className={`flex items-center rounded-lg border px-3 ${err && err.includes('이메일') ? "border-rose-300 bg-rose-50" : "border-stone-300 bg-white"}`}>
                <input
                  ref={emailInputRef}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your-email@example.com"
                  className={`w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent ${err && err.includes('이메일') ? "text-rose-900" : "text-stone-900"}`}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="email"
                />
              </div>

              <label className="block text-xs font-medium text-stone-600 mt-3">비밀번호</label>
              <div className={`flex items-center rounded-lg border px-3 ${err && err.includes('비밀번호') || err.includes('실패') ? "border-rose-300 bg-rose-50" : "border-stone-300 bg-white"}`}>
                <Lock size={16} className="mr-2 shrink-0 text-stone-500" />
                <input
                  ref={pwInputRef}
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  onKeyUp={handleKey}
                  onKeyDown={handleKey}
                  placeholder="Password"
                  className={`w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent ${err && err.includes('비밀번호') || err.includes('실패') ? "text-rose-900" : "text-stone-900"}`}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="ml-2 rounded p-1 text-stone-500 hover:bg-stone-100"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {caps && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                  <AlertCircle size={14} /> CapsLock이 켜져 있습니다.
                </div>
              )}

              {err && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                  <AlertCircle size={14} /> {err}
                </div>
              )}
              
              <button
                onClick={submit}
                disabled={loading || (!email || !pw)}
                className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                  loading || (!email || !pw)
                    ? "cursor-not-allowed bg-stone-200 text-stone-500"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {loading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                    확인 중…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Admin 로그인
                  </>
                )}
              </button>
            </>
          )}
          
          {/* Mock Auth: 즉시 로그인 버튼 */}
          {useMockAuth && (
            <button
              onClick={submit}
              disabled={loading}
              className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                loading
                  ? "cursor-not-allowed bg-stone-200 text-stone-500"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                  확인 중…
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} /> 즉시 로그인
                </>
              )}
            </button>
          )}
          
          {TEAM_CONFIG.sandboxMode && !useMockAuth && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-stone-500">또는</span>
                </div>
              </div>
              
              <button
                onClick={submitAsSandboxGuest}
                disabled={loading}
                className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                  loading
                    ? "cursor-not-allowed bg-stone-200 text-stone-500"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {loading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                    확인 중…
                  </>
                ) : (
                  <>
                    <UserCircle size={16} /> 샌드박스 유저로 로그인
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
