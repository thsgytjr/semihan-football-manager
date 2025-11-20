// src/pages/MaintenancePage.jsx
// 유지보수 중 페이지 - 축구 테마의 애니메이션

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wrench, Clock, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import runnerRefImg from '../assets/runner_ref.jpg'
import runnerTackleImg from '../assets/runner_tackle.jpg'

export default function MaintenancePage() {
  const { t } = useTranslation()
  const [shine, setShine] = useState(false)
  // ───────────── Dino-style soccer runner state ─────────────
  const runCanvasRef = useRef(null)
  const rafRef = useRef(null)
  const runningRef = useRef(false)
  const overRef = useRef(false)
  const scoreRef = useRef(0)
  const highRef = useRef(0)
  const globalBestRef = useRef(0)
  const userRankRef = useRef(null)
  const lastTsRef = useRef(0)
  const ballRef = useRef({ x: 70, y: 0, vy: 0, angle: 0 })
  const obstaclesRef = useRef([])
  const spawnRef = useRef(0)
  const speedRef = useRef(320)
  const patternIndexRef = useRef(0)
  const imgStandRef = useRef(null)
  const imgSlideRef = useRef(null)
  const W = 360, H = 200
  const groundY = 160
  const R = 12
  const G = 1400

  // subtle header shine
  useEffect(() => {
    const id = setInterval(() => setShine(s => !s), 5000)
    return () => clearInterval(id)
  }, [])

  // Load global best score
  useEffect(() => {
    async function loadGlobalBest() {
      try {
        console.log('[Runner] Fetching global best score...')
        const { data, error } = await supabase
          .from('runner_scores')
          .select('score')
          .order('score', { ascending: false })
          .limit(1)
          .single()
        console.log('[Runner] Global best query result:', { data, error })
        if (!error && data) {
          console.log('[Runner] Setting global best to:', data.score)
          globalBestRef.current = data.score
        } else {
          console.log('[Runner] No global best found or error:', error)
        }
      } catch (e) {
        console.log('[Runner] Global best score error:', e)
      }
    }
    loadGlobalBest()
    // Preload images from bundled assets
    const imgStand = new Image()
    imgStand.src = runnerRefImg
    imgStandRef.current = imgStand
    const imgSlide = new Image()
    imgSlide.src = runnerTackleImg
    imgSlideRef.current = imgSlide
  }, [])

  // Runner input and loop
  useEffect(() => {
    try { highRef.current = Number(localStorage.getItem('sfm:runner:hs') || 0) || 0 } catch {}
    const canvas = runCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function reset() {
      scoreRef.current = 0
      obstaclesRef.current = []
      spawnRef.current = 0
      speedRef.current = 320
      patternIndexRef.current = 0
      overRef.current = false
      runningRef.current = false
      ballRef.current = { x: 70, y: groundY - R, vy: 0, angle: 0 }
      lastTsRef.current = 0
      draw() // draw idle state
    }
    function start() {
      if (runningRef.current && !overRef.current) return
      overRef.current = false
      runningRef.current = true
      lastTsRef.current = 0
      rafRef.current = requestAnimationFrame(loop)
    }
    function jump() {
      if (overRef.current) { reset(); start(); return }
      if (!runningRef.current) { start(); return }
      // only allow jump when on ground
      if (Math.abs(ballRef.current.y - (groundY - R)) < 0.5) {
        ballRef.current.vy = -520
      }
    }

    function onKey(e) { if (e.code === 'Space') { e.preventDefault(); jump() } }
    function onTouch(e) { e.preventDefault(); jump() }
    window.addEventListener('keydown', onKey, { passive: false })
    canvas.addEventListener('touchstart', onTouch, { passive: false })
    canvas.addEventListener('mousedown', onTouch)

    function loop(ts) {
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr; canvas.height = H * dpr
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      if (!lastTsRef.current) lastTsRef.current = ts || performance.now()
      const now = ts || performance.now()
      const dt = Math.min(0.035, (now - lastTsRef.current) / 1000)
      lastTsRef.current = now

      // physics
      ballRef.current.vy += G * dt
      ballRef.current.y += ballRef.current.vy * dt
      if (ballRef.current.y > groundY - R) { ballRef.current.y = groundY - R; ballRef.current.vy = 0 }
      // roll angle when on ground
      if (Math.abs(ballRef.current.y - (groundY - R)) < 0.5) {
        ballRef.current.angle += (speedRef.current * dt) / (R * Math.PI)
      } else {
        ballRef.current.angle += 2 * dt
      }

      // spawn obstacles (defenders) - fixed pattern
      spawnRef.current -= dt
      if (spawnRef.current <= 0) {
        // Fixed repeating pattern: ground, ground, air, ground, ground, air...
        const pattern = ['stand', 'slide-ground', 'slide-air', 'stand', 'slide-ground', 'slide-air']
        const current = pattern[patternIndexRef.current % pattern.length]
        patternIndexRef.current++
        
        if (current === 'stand') {
          // standing defender: head + body + legs
          const h = 46, w = 20
          obstaclesRef.current.push({ type: 'stand', x: W + 10, y: groundY - h, w, h, passed: false })
        } else if (current === 'slide-ground') {
          // sliding tackle on ground
          const h = 16, w = 32
          obstaclesRef.current.push({ type: 'slide', x: W + 10, y: groundY - h, w, h, passed: false })
        } else {
          // sliding tackle in air
          const h = 16, w = 32
          obstaclesRef.current.push({ type: 'slide', x: W + 10, y: groundY - 55, w, h, passed: false })
        }
        // Progressively shorter spawn intervals (much more difficult)
        const baseInterval = Math.max(0.35, 0.7 - scoreRef.current * 0.02)
        const variance = Math.max(0.15, 0.5 - scoreRef.current * 0.015)
        spawnRef.current = baseInterval + Math.random() * variance
      }

      // move obstacles
      const spd = speedRef.current
      obstaclesRef.current.forEach(o => { o.x -= spd * dt })
      obstaclesRef.current = obstaclesRef.current.filter(o => o.x + o.w > -10)

      // scoring and difficulty
      obstaclesRef.current.forEach(o => {
        if (!o.passed && o.x + o.w < ballRef.current.x - R) {
          o.passed = true
          scoreRef.current += 1
          // Much more aggressive difficulty: speed increases every 2 points
          if (scoreRef.current % 2 === 0) {
            speedRef.current += 20
          }
          // Big speed burst every 5 points
          if (scoreRef.current % 5 === 0) {
            speedRef.current += 40
          }
        }
      })

      // collisions (circle vs rect)
      const cx = ballRef.current.x, cy = ballRef.current.y, r = R
      for (const o of obstaclesRef.current) {
        const closestX = Math.max(o.x, Math.min(cx, o.x + o.w))
        const closestY = Math.max(o.y, Math.min(cy, o.y + o.h))
        const dx = cx - closestX, dy = cy - closestY
        if (dx * dx + dy * dy <= r * r) {
          overRef.current = true
          runningRef.current = false
          try {
            const hs = Number(localStorage.getItem('sfm:runner:hs') || 0) || 0
            if (scoreRef.current > hs) {
              localStorage.setItem('sfm:runner:hs', String(scoreRef.current))
              // Submit to server
              submitScore(scoreRef.current)
            }
            highRef.current = Math.max(hs, scoreRef.current)
          } catch {}
          break
        }
      }

      draw()
      if (!overRef.current) rafRef.current = requestAnimationFrame(loop)
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)
      // field background (white)
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H)
      // half-line
      ctx.strokeStyle = 'rgba(16,185,129,0.6)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, groundY + 0.5); ctx.lineTo(W, groundY + 0.5); ctx.stroke()
      // player ball (soccer emoji with rotation)
      ctx.save()
      ctx.translate(ballRef.current.x, ballRef.current.y)
      ctx.rotate(ballRef.current.angle)
      ctx.font = `${R * 2}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⚽', 0, 0)
      ctx.restore()
      // obstacles: defenders (use images)
      obstaclesRef.current.forEach(o => {
        const img = o.type === 'stand' ? imgStandRef.current : imgSlideRef.current
        if (img && img.complete) {
          ctx.drawImage(img, o.x, o.y, o.w, o.h)
        } else {
          // Fallback if image not loaded
          ctx.fillStyle = o.type === 'stand' ? '#10b981' : '#ef4444'
          ctx.fillRect(o.x, o.y, o.w, o.h)
        }
      })
      // HUD
      ctx.fillStyle = '#065f46'; ctx.font = 'bold 14px ui-sans-serif, system-ui'
      ctx.fillText(`Score ${scoreRef.current}`, 12, 20)
      if (highRef.current > 0) ctx.fillText(`Your Best ${highRef.current}`, 12, 38)
      if (globalBestRef.current > 0) { ctx.fillStyle = '#f59e0b'; ctx.fillText(`🏆 Server Best ${globalBestRef.current}`, 12, 56) }
      if (userRankRef.current) { ctx.fillStyle = '#8b5cf6'; ctx.fillText(`Rank #${userRankRef.current}`, W - 80, 20) }
      if (!runningRef.current && !overRef.current) { ctx.fillStyle = 'rgba(31,41,55,0.7)'; ctx.fillText('Tap/Space to start', W/2 - 60, 90) }
      if (overRef.current) { ctx.fillStyle = 'rgba(220,38,38,0.9)'; ctx.fillText('Game Over · Tap/Space', W/2 - 70, 90) }
    }

    async function submitScore(score) {
      try {
        console.log('[Runner] Submitting score:', score)
        const userId = localStorage.getItem('user') || 'anonymous'
        const { error: insertError } = await supabase.from('runner_scores').insert({ user_id: userId, score })
        console.log('[Runner] Insert result:', insertError)
        // Reload global best
        const { data, error: fetchError } = await supabase.from('runner_scores').select('score').order('score', { ascending: false }).limit(1).single()
        console.log('[Runner] Reloaded global best:', { data, error: fetchError })
        if (data) globalBestRef.current = data.score
        // Get user rank
        const { count } = await supabase.from('runner_scores').select('score', { count: 'exact', head: true }).gt('score', score)
        if (count !== null) userRankRef.current = count + 1
      } catch (e) {
        console.log('[Runner] Score submission failed:', e)
      }
    }

    // init
    reset()
    return () => {
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('touchstart', onTouch)
      canvas.removeEventListener('mousedown', onTouch)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])
  return (
    <div className="min-h-screen flex items-start justify-center pt-8 p-4 overflow-hidden relative bg-gradient-to-b from-emerald-50 via-green-50 to-emerald-100">
      {/* 상단 광원 그라데이션 */}
      <div className="pointer-events-none absolute -top-1/3 left-0 right-0 h-[60vh] opacity-60 blur-3xl" style={{
        background: 'radial-gradient(800px 300px at 20% 0%, rgba(34,197,94,0.25), transparent), radial-gradient(800px 300px at 80% 0%, rgba(20,184,166,0.25), transparent)'
      }} />
      {/* 잔디 패턴 */}
      <div className="absolute inset-0 opacity-10">
        <div className="h-full w-full" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 40px, #10b981 40px, #10b981 80px)`
        }}></div>
      </div>

      {/* 축구 필드 라인 + 은은한 조명 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[min(92vw,880px)] h-[min(62vw,520px)] border-4 border-white/80 rounded-[18px] relative shadow-[0_0_80px_rgba(16,185,129,0.15)]">
          <div className="absolute left-1/2 top-0 bottom-0 w-[3px] bg-white/80 -translate-x-1/2"></div>
          <div className="absolute left-1/2 top-1/2 w-28 h-28 border-4 border-white/80 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute inset-2 rounded-[14px] border-2 border-white/40" />
          {/* 페널티 박스 라인 (양쪽) */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 w-28 h-40 border-2 border-white/60 rounded-md" />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 w-28 h-40 border-2 border-white/60 rounded-md" />
        </div>
      </div>

      {/* Decorative emoji layers removed */}

      {/* 메인 컨텐츠 */}
      <div className="relative z-10 max-w-2xl w-full">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-[0_30px_60px_rgba(16,185,129,0.25)] border border-emerald-100/70 overflow-hidden">
          {/* 헤더 */}
          <div className="relative bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 text-white">
            <div className="flex items-center justify-center gap-3">
              <Wrench className="w-8 h-8" />
              <h1 className="text-2xl font-bold">System Maintenance</h1>
            </div>
            <div className="flex items-center justify-center gap-2 mt-2 text-emerald-50 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>점검 진행중</span>
            </div>
          </div>

          {/* 본문 */}
          <div className="px-6 py-4 space-y-4">
            {/* 간단한 안내 */}
            <div className="text-center">
              <p className="text-stone-600 text-sm">시스템 점검 중입니다. 잠시 후 다시 시도해주세요.</p>
            </div>

            {/* Soccer runner (centered) */}
            <div className="flex flex-col items-center">
              <div className="mb-2 text-xs text-stone-500">탭/스페이스로 점프해서 수비수를 피하세요!</div>
              <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
                <canvas ref={runCanvasRef} width={360} height={200} className="block max-w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Removed game switcher and old mini-games */}
      </div>

      {/* Background sparkles removed (no emojis) */}

      {/* CSS Keyframes */}
      <style>{`
        /* keep shine only */
        @keyframes shine {
          0% { transform: translateX(-120%); opacity: 0 }
          20% { opacity: .9 }
          100% { transform: translateX(120%); opacity: 0 }
        }
      `}</style>
    </div>
  )
}
