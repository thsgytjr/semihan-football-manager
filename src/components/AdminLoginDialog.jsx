// src/components/AdminLoginDialog.jsx
import React, { useEffect, useRef, useState } from "react"
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, X } from "lucide-react"

export default function AdminLoginDialog({
  isOpen,
  onClose,
  onSuccess,
  adminPass, // required: 실제 검증에 사용
}) {
  const [pw, setPw] = useState("")
  const [email, setEmail] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState("")
  const [caps, setCaps] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  
  // localhost 개발 환경 확인 (명시적 체크)
  const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
  )

  useEffect(() => {
    if (isOpen) {
      setEmail("")
      setPw("")
      setErr("")
      setCaps(false)
      setLoading(false)
      if (!isLocalhost) {
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
  }, [isOpen, isLocalhost])

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
      // localhost에서는 비밀번호 검증 안함
      if (isLocalhost) {
        const success = await onSuccess(email || "dev@localhost", "")
        if (success) {
          setLoading(false)
        } else {
          setErr("로그인에 실패했습니다.")
          setLoading(false)
        }
      } else {
        // 실제 환경에서는 이메일과 비밀번호 검증
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
        
        if (pw && pw === adminPass) {
          const success = await onSuccess(email, pw)
          if (success) {
            setLoading(false)
          } else {
            setErr("로그인에 실패했습니다.")
            setLoading(false)
          }
        } else {
          setErr("비밀번호가 올바르지 않습니다.")
          setLoading(false)
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      setErr("로그인 중 오류가 발생했습니다.")
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
          {isLocalhost && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 border border-blue-200">
              🚧 개발 모드: 비밀번호 검증을 건너뜁니다.
            </div>
          )}
          
          {!isLocalhost && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="admin@example.com"
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none bg-white ${err ? "border-rose-300" : "border-stone-300"}`}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">비밀번호</label>
                <div className={`flex items-center rounded-lg border px-3 ${err ? "border-rose-300 bg-rose-50" : "border-stone-300 bg-white"}`}>
                  <Lock size={16} className="mr-2 shrink-0 text-stone-500" />
                  <input
                    ref={inputRef}
                    type={showPw ? "text" : "password"}
                    value={pw}
                    onChange={e => setPw(e.target.value)}
                    onKeyUp={handleKey}
                    onKeyDown={handleKey}
                    placeholder="비밀번호를 입력하세요"
                    className={`w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent ${err ? "text-rose-900" : "text-stone-900"}`}
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
            </>
          )}

          <button
            onClick={submit}
            disabled={loading || (!isLocalhost && (!email || !pw))}
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
              loading || (!isLocalhost && (!email || !pw))
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
                <CheckCircle2 size={16} /> 로그인
              </>
            )}
          </button>

          <p className="pt-1 text-center text-[11px] text-stone-400">
            {isLocalhost ? "개발 모드: 비밀번호 없이 로그인됩니다." : "이 기기에서만 유지됩니다. (로컬 스토리지)"}
          </p>
        </div>
      </div>
    </div>
  )
}
