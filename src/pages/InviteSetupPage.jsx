// src/pages/InviteSetupPage.jsx
// Supabase Auth 초대 이메일 링크로 접근 시 비밀번호 설정 페이지
import React, { useState, useEffect } from "react"
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, Mail } from "lucide-react"
import { supabase } from "../lib/supabaseClient"
import { logger } from "../lib/logger"
import { TEAM_CONFIG } from "../lib/teamConfig"

export default function InviteSetupPage({ onComplete }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [hasInviteToken, setHasInviteToken] = useState(false)

  useEffect(() => {
    // URL에서 초대 토큰 확인 (access_token, type=invite)
    const checkInviteToken = async () => {
      try {
        // Supabase는 hash fragment에 토큰을 담아 보냄
        const params = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = params.get('access_token')
        const type = params.get('type')
        
        logger.log('[InviteSetup] URL params:', { type, hasToken: !!accessToken })

        if (accessToken && type === 'invite') {
          setHasInviteToken(true)
          // 세션 확인
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError) {
            logger.error('[InviteSetup] Session error:', sessionError)
            setError('초대 링크가 유효하지 않습니다.')
            setSessionChecked(true)
            return
          }

          if (session?.user) {
            setEmail(session.user.email || '')
            logger.log('[InviteSetup] Invite session loaded:', session.user.email)
          } else {
            setError('세션을 불러올 수 없습니다. 초대 링크를 다시 확인해주세요.')
          }
        } else {
          // 초대 토큰이 없으면 일반 로그인 상태 확인
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            setEmail(session.user.email || '')
            // 이미 로그인된 사용자 → 비밀번호 변경 모드
            logger.log('[InviteSetup] Already logged in:', session.user.email)
          }
        }
      } catch (err) {
        logger.error('[InviteSetup] Token check error:', err)
        setError('초대 링크 확인 중 오류가 발생했습니다.')
      } finally {
        setSessionChecked(true)
      }
    }

    checkInviteToken()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    // 유효성 검사
    if (!password) {
      setError("비밀번호를 입력하세요.")
      return
    }

    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.")
      return
    }

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }

    setLoading(true)

    try {
      // Supabase updateUser로 비밀번호 설정
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        logger.error('[InviteSetup] Password update error:', updateError)
        setError(updateError.message || '비밀번호 설정에 실패했습니다.')
        setLoading(false)
        return
      }

      logger.log('[InviteSetup] Password set successfully for:', data.user.email)
      setSuccess(true)

      // 2초 후 완료 콜백 호출 (메인 앱으로 복귀)
      setTimeout(() => {
        if (onComplete) {
          onComplete(data.user)
        } else {
          // 기본 동작: 메인 페이지로 리다이렉트
          window.location.href = '/'
        }
      }, 2000)

    } catch (err) {
      logger.error('[InviteSetup] Unexpected error:', err)
      setError('비밀번호 설정 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="mt-4 text-sm text-stone-600">초대 정보를 확인하고 있습니다...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-stone-900">비밀번호 설정 완료!</h2>
          <p className="mt-2 text-sm text-stone-600">
            {TEAM_CONFIG.teamName}에 오신 것을 환영합니다.
            <br />
            잠시 후 메인 페이지로 이동합니다...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-xl">
        {/* 헤더 */}
        <div className="border-b border-stone-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">비밀번호 설정</h2>
              <p className="text-sm text-stone-500">
                {hasInviteToken ? '초대를 수락하고 비밀번호를 설정하세요.' : '새 비밀번호를 입력하세요.'}
              </p>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* 이메일 표시 (읽기 전용) */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">이메일</label>
            <div className="flex items-center rounded-lg border border-stone-300 bg-stone-50 px-3 py-2">
              <Mail size={16} className="mr-2 shrink-0 text-stone-400" />
              <input
                type="email"
                value={email}
                readOnly
                className="w-full bg-transparent text-sm text-stone-700 outline-none"
                placeholder="loading..."
              />
            </div>
          </div>

          {/* 새 비밀번호 */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">새 비밀번호</label>
            <div className={`flex items-center rounded-lg border px-3 ${
              error && error.includes('비밀번호') ? 'border-rose-300 bg-rose-50' : 'border-stone-300 bg-white'
            }`}>
              <Lock size={16} className="mr-2 shrink-0 text-stone-500" />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="최소 6자 이상"
                className={`w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent ${
                  error && error.includes('비밀번호') ? 'text-rose-900' : 'text-stone-900'
                }`}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="new-password"
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

          {/* 비밀번호 확인 */}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">비밀번호 확인</label>
            <div className={`flex items-center rounded-lg border px-3 ${
              error && error.includes('일치') ? 'border-rose-300 bg-rose-50' : 'border-stone-300 bg-white'
            }`}>
              <Lock size={16} className="mr-2 shrink-0 text-stone-500" />
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 재입력"
                className={`w-full py-2 text-sm outline-none placeholder:text-stone-400 bg-transparent ${
                  error && error.includes('일치') ? 'text-rose-900' : 'text-stone-900'
                }`}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="ml-2 rounded p-1 text-stone-500 hover:bg-stone-100"
                onClick={() => setShowConfirm(v => !v)}
                aria-label={showConfirm ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={loading || !password || !confirmPassword || !email}
            className={`w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition ${
              loading || !password || !confirmPassword || !email
                ? 'cursor-not-allowed bg-stone-200 text-stone-500'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                설정 중...
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                비밀번호 설정 완료
              </>
            )}
          </button>

          <p className="pt-2 text-center text-xs text-stone-400">
            설정 후 자동으로 로그인됩니다.
          </p>
        </form>
      </div>
    </div>
  )
}
