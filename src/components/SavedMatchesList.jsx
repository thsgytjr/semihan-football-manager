// src/components/SavedMatchesList.jsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import InitialAvatar from "./InitialAvatar"
import { overall } from "../lib/players"
import { hydrateMatch } from "../lib/match"
import { formatMatchLabel } from "../lib/matchLabel"
import draftIcon from "../assets/draft.png"

/* ---------------------- 폭죽 효과 컴포넌트 ---------------------- */
function Confetti() {
  const canvasRef = useRef(null)
  const animationStartTime = useRef(null)
  const ANIMATION_DURATION = 30000 // 30 seconds total animation

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#a855f7', '#fde047', '#e11d48']

    // Reset animation start time when component mounts
    animationStartTime.current = null

    // DPI aware canvas sizing
    const resize = () => {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    // Firework shell and spark models
    const shells = []
    const sparks = []
    const maxSparks = 400 // Increased for bigger explosions
    const gravity = 0.06 // Slightly reduced gravity for longer hang time
    const airDrag = 0.985 // Less drag for wider spread

    let raf = 0
    let lastSpawn = 0
    let finaleTriggered = false

    function spawnShell(now) {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      if (w <= 0 || h <= 0) return // Guard against invalid dimensions
      
      const x = Math.random() * w * 0.8 + w * 0.1 // Wider launch area
      const y = h + 10
      const targetY = h * (0.2 + Math.random() * 0.3) // Higher explosions for better visibility
      const vy = -(5 + Math.random() * 3) // More launch power
      const vx = (Math.random() - 0.5) * 1.5 // More lateral movement
      const color = colors[Math.floor(Math.random() * colors.length)]
      shells.push({ x, y, vx, vy, targetY, color, trail: [] })
      lastSpawn = now
    }

    function explode(shell) {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      const count = 80 + Math.floor(Math.random() * 40) // Increased particle count for bigger show
      const baseHue = shell.color
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.2
        const spd = 3.5 + Math.random() * 3.0 // Much higher speed for wider spread
        const vx = Math.cos(ang) * spd
        const vy = Math.sin(ang) * spd
        const life = 35 + Math.floor(Math.random() * 25) // Longer life for bigger show
        const size = 1.5 + Math.random() * 1.5 // Larger particles
        sparks.push({
          x: shell.x,
          y: shell.y,
          vx,
          vy,
          life,
          age: 0,
          size,
          color: baseHue,
          trail: []
        })
      }
      // More aggressive spark cleanup
      if (sparks.length > maxSparks) {
        sparks.splice(0, sparks.length - maxSparks)
      }
    }

    function spawnFinaleConfetti() {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      const finaleCount = 200 + Math.floor(Math.random() * 150) // 200-350 particles for better coverage
      
      // Create multiple explosion points with better right-side coverage
      const explosionPoints = [
        { x: w * 0.1, y: h * 0.25 },  // Far left top
        { x: w * 0.25, y: h * 0.35 }, // Left
        { x: w * 0.4, y: h * 0.2 },   // Left-center top
        { x: w * 0.5, y: h * 0.3 },   // Center
        { x: w * 0.6, y: h * 0.2 },   // Right-center top
        { x: w * 0.75, y: h * 0.35 }, // Right
        { x: w * 0.9, y: h * 0.25 },  // Far right top
        { x: w * 0.15, y: h * 0.5 },  // Left middle
        { x: w * 0.85, y: h * 0.5 },  // Right middle
        { x: w * 0.95, y: h * 0.4 },  // Very far right
        { x: w * 0.05, y: h * 0.4 }   // Very far left
      ]
      
      explosionPoints.forEach((point, pointIndex) => {
        const particlesPerPoint = Math.floor(finaleCount / explosionPoints.length)
        for (let i = 0; i < particlesPerPoint; i++) {
          const ang = (i / particlesPerPoint) * Math.PI * 2 + Math.random() * 0.4
          const spd = 5.0 + Math.random() * 5.0 // Even higher speed for better coverage
          const vx = Math.cos(ang) * spd
          const vy = Math.sin(ang) * spd
          const life = 60 + Math.floor(Math.random() * 40) // Longer lasting finale
          const size = 2.5 + Math.random() * 2.5 // Even larger particles
          const color = colors[Math.floor(Math.random() * colors.length)]
          
          sparks.push({
            x: point.x,
            y: point.y,
            vx,
            vy,
            life,
            age: 0,
            size,
            color,
            trail: [],
            isFinale: true // Mark as finale particle
          })
        }
      })
      
      // Cap total sparks
      if (sparks.length > maxSparks * 2) { // Allow more for finale
        sparks.splice(0, sparks.length - maxSparks * 2)
      }
    }

    function step(now) {
      // Initialize animation start time
      if (animationStartTime.current === null) {
        animationStartTime.current = now
      }

      // Check if animation should end
      const elapsed = now - animationStartTime.current
      if (elapsed > ANIMATION_DURATION) {
        // Complete canvas clearing - multiple methods to ensure all traces are gone
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        // Clear all particle arrays
        shells.length = 0
        sparks.length = 0
        return // Stop the animation loop
      }

      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      
      // Clear entire canvas with proper dimensions - use canvas actual size
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Also clear with display dimensions as backup
      ctx.clearRect(0, 0, w, h)

      // Spawn shells for first 25 seconds, with more frequent launches for bigger show
      if (elapsed < 25000 && now - lastSpawn > 800 + Math.random() * 600 && shells.length < 3) {
        spawnShell(now)
      }

      // Trigger finale confetti at 27 seconds (3 seconds before end)
      if (elapsed >= 27000 && !finaleTriggered) {
        spawnFinaleConfetti()
        finaleTriggered = true
      }

      // Update shells with bounds checking
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]
        if (!s) continue // Safety check
        
        s.trail.push({ x: s.x, y: s.y })
        if (s.trail.length > 6) s.trail.shift() // Shorter trail
        
        s.x += s.vx
        s.y += s.vy
        s.vy += gravity * 0.3
        
        // Draw shell trail with bounds checking
        if (s.trail.length > 1) {
          ctx.beginPath()
          ctx.strokeStyle = s.color
          ctx.lineWidth = 1.5
          for (let t = 0; t < s.trail.length - 1; t++) {
            const a = s.trail[t]
            const b = s.trail[t + 1]
            if (a && b) {
              ctx.globalAlpha = (t + 1) / s.trail.length * 0.7
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
            }
          }
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        // Check for explosion or removal
        if (s.vy >= 0 || s.y <= s.targetY) {
          explode(s)
          shells.splice(i, 1)
        } else if (s.x < -50 || s.x > w + 50 || s.y > h + 50) {
          shells.splice(i, 1)
        }
      }

      // Update sparks with more aggressive cleanup
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]
        if (!p) continue // Safety check
        
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 4) p.trail.shift() // Much shorter trail
        
        p.x += p.vx
        p.y += p.vy
        p.vx *= airDrag
        p.vy = p.vy * airDrag + gravity
        p.age++

        const alpha = Math.max(0, 1 - p.age / p.life)
        
        // Draw trail with bounds checking
        if (p.trail.length > 1 && alpha > 0.1) {
          ctx.beginPath()
          ctx.strokeStyle = p.color
          ctx.lineWidth = Math.max(0.5, p.size * 0.8)
          for (let t = 0; t < p.trail.length - 1; t++) {
            const a = p.trail[t]
            const b = p.trail[t + 1]
            if (a && b) {
              ctx.globalAlpha = alpha * ((t + 1) / p.trail.length) * 0.6
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
            }
          }
          ctx.stroke()
        }

        // Draw spark head - make finale particles more prominent
        if (alpha > 0.1) {
          ctx.beginPath()
          ctx.fillStyle = p.color
          ctx.globalAlpha = alpha
          const sparkSize = p.isFinale ? Math.max(1.0, p.size * 1.5) : Math.max(0.5, p.size)
          ctx.arc(p.x, p.y, sparkSize, 0, Math.PI * 2)
          ctx.fill()
          
          // Add extra glow for finale particles
          if (p.isFinale && alpha > 0.3) {
            ctx.beginPath()
            ctx.globalAlpha = alpha * 0.3
            ctx.arc(p.x, p.y, sparkSize * 2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        
        // Always reset global alpha to prevent accumulation
        ctx.globalAlpha = 1

        // More aggressive removal conditions - but keep finale particles longer and allow wider spread
        const isFinaleParticle = p.isFinale === true
        const removalThreshold = isFinaleParticle ? 0.05 : 0.1
        const boundary = isFinaleParticle ? 100 : 50 // Allow finale particles to go further off-screen
        if (p.age > p.life || alpha <= removalThreshold || p.x < -boundary || p.x > w + boundary || p.y > h + boundary || 
            (!isFinaleParticle && Math.abs(p.vx) < 0.1 && Math.abs(p.vy) < 0.1)) {
          sparks.splice(i, 1)
        }
      }

      // Continue animation only if we haven't exceeded duration
      if (elapsed < ANIMATION_DURATION) {
        raf = requestAnimationFrame(step)
      }
    }

    raf = requestAnimationFrame(step)

    return () => {
      window.removeEventListener('resize', resize)
      if (raf) {
        cancelAnimationFrame(raf)
      }
      // Clear canvas on cleanup - multiple methods to ensure complete clearing
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
        // Reset canvas state
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

const S = (v)=>v==null?"":String(v)
const isMember = (m)=>{ const s=S(m).trim().toLowerCase(); return s==="member"||s.includes("정회원") }
const GuestBadge = ()=>(
  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700" title="게스트">
    G
  </span>
)
const CaptainBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800" title="주장">
    C
  </span>
)

/* ---------------------- G/A 집계 유틸 ---------------------- */
const toStr = (v) => (v === null || v === undefined) ? '' : String(v)
/**
 * extractStatsByPlayerForOneMatch:
 * - 다양한 호환 필드(m.stats | m.records | m.playerStats | m.ga | m.scoreboard)를 받아
 *   playerId 별 { goals, assists }를 반환
 */
function extractStatsByPlayerForOneMatch(m){
  const src = m?.stats ?? m?.records ?? m?.playerStats ?? m?.ga ?? m?.scoreboard ?? null
  const out = {}
  if (!src) return out
  if (!Array.isArray(src) && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const pid = toStr(k)
      if (!pid) continue
      const goals = Number(v?.goals || v?.G || 0)
      const assists = Number(v?.assists || v?.A || 0)
      out[pid] = { goals, assists }
    }
    return out
  }
  if (Array.isArray(src)) {
    for (const rec of src) {
      const pid = toStr(rec?.playerId ?? rec?.id ?? rec?.user_id ?? rec?.uid ?? rec?.player)
      if (!pid) continue
      const type = (rec?.type || (rec?.goal ? 'goals' : rec?.assist ? 'assists' : null) || (rec?.action) || '').toString().toLowerCase()
      const isGoal = /goal/i.test(type)
      const isAssist = /assist/i.test(type)
      const g = Number(rec?.goals || (isGoal ? 1 : 0) || 0)
      const a = Number(rec?.assists || (isAssist ? 1 : 0) || 0)
      const prev = out[pid] || { goals: 0, assists: 0 }
      out[pid] = { goals: prev.goals + (g||0), assists: prev.assists + (a||0) }
    }
    return out
  }
  return out
}

/* ---------------------- 공통 요금 유틸 ---------------------- */
/** 
 * calcFees: $1 단위, 게스트는 멤버보다 항상 +$2, 합계가 total 미만이면 $1씩 올려 충족(초과 허용)
 */
function calcFees({ total, memberCount, guestCount }) {
  total = Math.max(0, Number(total) || 0);
  const count = memberCount + guestCount;
  if (total <= 0 || count === 0) return { total, memberFee: 0, guestFee: 0 };

  // 1) 최소 단가로 시작: floor((T - 2g) / (m + g))
  let baseEach = Math.floor((total - 2 * guestCount) / count);
  if (!Number.isFinite(baseEach) || baseEach < 0) baseEach = 0;

  // 2) 게스트는 항상 멤버 +$2
  let memberFee = baseEach;
  let guestFee  = baseEach + 2;

  // 3) 모자라면 $1씩만 올려 최소 초과로 맞춤 (정확히 나누어떨어지면 딱 맞음)
  let sum = memberCount * memberFee + guestCount * guestFee;
  while (sum < total) {
    memberFee += 1;
    guestFee  = memberFee + 2;
    sum = memberCount * memberFee + guestCount * guestFee;
  }

  return { total, memberFee, guestFee };
}

/* ---------------------- YouTube 유틸 ---------------------- */
function parseYouTubeIdFromUrl(url) {
  const s = S(url).trim()
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id || null
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2] || u.pathname.split('/')[1]
        return id || null
      }
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2]
        return id || null
      }
      const v = u.searchParams.get('v')
      if (v) return v
    }
  } catch {}
  const rx = /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  const m = s.match(rx)
  if (m && m[1]) return m[1]
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  return null
}

/** match 객체에서 유튜브 {id,url,title,sourceIndex?} 배열 생성 */
function extractYouTubeEntries(match){
  const prefers = []

  // 1) 권장 단일 필드
  if (match?.youtubeUrl) {
    prefers.push({ url: match.youtubeUrl, title: match?.youtubeTitle })
  }

  // 2) videos 배열(문자열/객체 혼용)
  if (Array.isArray(match?.videos)) {
    match.videos.forEach((v, idx) => {
      if (typeof v === 'string') prefers.push({ url: v, title: match?.youtubeTitle, sourceIndex: idx })
      else if (v && typeof v === 'object') prefers.push({ url: v.url || v.link || v.href, title: v.title, sourceIndex: idx })
    })
  }

  // 3) 여분 배열 필드
  ;['links', 'media', 'attachments'].forEach(k=>{
    const arr = match?.[k]
    if (Array.isArray(arr)) {
      arr.forEach((item) => {
        const url = typeof item === 'string' ? item : (item?.url || item?.link || item?.href)
        const title = (typeof item === 'object' && item?.title) || match?.youtubeTitle || match?.title || match?.name
        if (url) prefers.push({ url, title })
      })
    }
  })

  // URL → ID 변환 + 정리
  const out = []
  prefers.forEach((cand) => {
    const id = parseYouTubeIdFromUrl(cand.url)
    if (id) out.push({ id, url: `https://www.youtube.com/watch?v=${id}`, title: S(cand.title||''), sourceIndex: cand.sourceIndex })
  })
  // 중복 제거(id 기준)
  const seen = new Set()
  return out.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
}

function YouTubeThumb({ videoId, title, dateKey }) {
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  const href  = `https://www.youtube.com/watch?v=${videoId}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group relative block overflow-hidden rounded-lg border border-stone-200"
      title={title}
    >
      <img
        src={thumb}
        alt={title}
        loading="lazy"
        className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/60 via-black/10 to-transparent p-2">
        <div className="text-[11px] leading-tight text-white drop-shadow">
          <div className="font-medium truncate max-w-[160px] sm:max-w-[200px]">{title || 'Match Video'}</div>
          {dateKey ? <div className="opacity-90">{dateKey}</div> : null}
        </div>
        <div className="mb-1 mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-md group-hover:bg-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
    </a>
  )
}

/* ----------------------- 기타 유틸 ------------------------ */
const kitForTeam=(i)=>[
  {label:"화이트",headerClass:"bg-white text-stone-800 border-b border-stone-300"},
  {label:"블랙",headerClass:"bg-stone-900 text-white border-b border-stone-900"},
  {label:"블루",headerClass:"bg-blue-600 text-white border-b border-blue-700"},
  {label:"레드",headerClass:"bg-red-600 text-white border-b border-red-700"},
  {label:"그린",headerClass:"bg-emerald-600 text-white border-b border-emerald-700"},
  {label:"퍼플",headerClass:"bg-violet-600 text-white border-b border-violet-700"},
  {label:"오렌지",headerClass:"bg-orange-500 text-white border-b border-orange-600"},
  {label:"티얼",headerClass:"bg-teal-600 text-white border-b border-teal-700"},
  {label:"핑크",headerClass:"bg-pink-600 text-white border-b border-pink-700"},
  {label:"옐로",headerClass:"bg-yellow-400 text-stone-900 border-b border-yellow-500"},
][i%10]

const normalizeSnapshot=(m,teams)=>{
  const snap=Array.isArray(m?.snapshot)?m.snapshot:null
  return (snap&&snap.length===teams.length)?snap.map(a=>Array.isArray(a)?a.slice():[]):teams.map(list=>list.map(p=>p.id))
}
const notInMatchPlayers=(players,snap2D)=>{
  const inside=new Set(snap2D.flat().map(String))
  return players.filter(p=>!inside.has(String(p.id)))
}
const deriveFormatByLocation=(m)=>{
  const p=(m?.location?.preset||"").toLowerCase(), n=(m?.location?.name||"").toLowerCase()
  if(p==="indoor-soccer-zone"||n.includes("indoor soccer zone")) return "9v9"
  if(p==="coppell-west"||n.includes("coppell")) return "11v11"
  return m?.mode||""
}

/* ✅ 장소 → 구글맵 링크 생성 */
function getLocationLink(m){
  const preset = (m?.location?.preset || "").toLowerCase()
  if (preset === "indoor-soccer-zone")
    return "https://maps.app.goo.gl/cud8m52vVwZJEinN8?g_st=ic"
  if (preset === "coppell-west")
    return "https://maps.app.goo.gl/vBLE84hRB3ez1BJy5?g_st=ic"
  const addr = m?.location?.address || ""
  if (/^https?:\/\//i.test(addr)) return addr
  return null
}

/* 요금 계산: 새 규칙 (게스트 +$2, $1 단위, 총합 충족 보정) */
function deriveFeesFromSnapshot(m, players){
  // 1) 참석자 추출
  const ids=Array.isArray(m?.snapshot)&&m.snapshot.length?m.snapshot.flat():Array.isArray(m?.attendeeIds)?m.attendeeIds:[]
  const map=new Map(players.map(p=>[String(p.id),p]))
  const atts=ids.map(id=>map.get(String(id))).filter(Boolean)

  const memberCount=atts.filter(p=>isMember(p.membership)).length
  const guestCount=Math.max(0, atts.length-memberCount)

  // 2) 매치에 명시적 fees가 있으면 우선 사용
  if(m?.fees&&typeof m.fees.memberFee==="number"&&typeof m.fees.guestFee==="number"){
    const total = typeof m.fees.total === 'number' ? m.fees.total 
                  : (memberCount*m.fees.memberFee + guestCount*m.fees.guestFee)
    return { total, memberFee:m.fees.memberFee, guestFee:m.fees.guestFee, memberCount, guestCount, _estimated:false }
  }

  // 3) 장소 프리셋별 총액(Indoor=220, Coppell=330)
  const preset=(m?.location?.preset||"").toLowerCase()
  const total = preset==="indoor-soccer-zone" ? 220
              : preset==="coppell-west"        ? 330
              : (m?.fees?.total||0)

  // 4) 새 규칙 계산
  const { memberFee, guestFee } = calcFees({ total, memberCount, guestCount })
  return { total, memberFee, guestFee, memberCount, guestCount, _estimated:true }
}

/* ---------------------- 입력 컴포넌트 ---------------------- */
// 유튜브 링크 + 제목 추가
function VideoAdder({ onAdd }){
  const [url,setUrl]=useState("")
  const [title,setTitle]=useState("")
  const add=()=>{
    const u=url.trim()
    const t=title.trim()
    if(!u) return
    onAdd(u, t || null)
    setUrl(""); setTitle("")
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        placeholder="YouTube 링크 (https://youtu.be/... 또는 https://www.youtube.com/watch?v=...)"
        value={url} onChange={e=>setUrl(e.target.value)}
      />
      <input
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        placeholder="썸네일에 표시할 제목 (선택)"
        value={title} onChange={e=>setTitle(e.target.value)}
      />
      <button
        className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
        onClick={add}
      >
        추가
      </button>
    </div>
  )
}

/* 빠른 출석 편집(드래프트만 수정) */
function QuickAttendanceEditor({ players, snapshot, onDraftChange }){
  const [teamIdx,setTeamIdx]=useState(0),[q,setQ]=useState(""),[open,setOpen]=useState(false),[hi,setHi]=useState(-1)
  const wrapRef=useRef(null), listRef=useRef(null)
  const cands=useMemo(()=>notInMatchPlayers(players,snapshot),[players,snapshot])
  const list=useMemo(()=>{
    const t=q.trim().toLowerCase()
    const base=t?cands.filter(p=>(p.name||"").toLowerCase().includes(t)):cands
    return base.slice().sort((a,b)=>{
      const an=(a.name||"").toLowerCase(), bn=(b.name||"").toLowerCase()
      const ai=an.indexOf(t), bi=bn.indexOf(t); const aw=ai<0?999:ai, bw=bi<0?999:bi
      return aw-bw||an.localeCompare(bn)
    }).slice(0,40)
  },[cands,q])
  useEffect(()=>{
    const h=e=>{ if(!wrapRef.current) return; if(!wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h)
  },[])
  useEffect(()=>{
    if(listRef.current&&hi>=0){ const el=listRef.current.querySelector(`[data-idx="${hi}"]`)
      if(el){ const {offsetTop:h,offsetHeight:hh}=el; const {scrollTop:t,clientHeight:c}=listRef.current
        if(h<t) listRef.current.scrollTop=h; else if(h+hh>t+c) listRef.current.scrollTop=h-c+hh } }
  },[hi])
  const add=(pLike)=>{
    const p=typeof pLike==="string"?list.find(pp=>(pp.name||"").toLowerCase()===pLike.trim().toLowerCase()):pLike
    if(!p) return
    const id=p.id, next=snapshot.map((arr,i)=>i===teamIdx?(arr.some(x=>String(x)===String(id))?arr:[...arr,id]):arr)
    onDraftChange(next); setQ(""); setHi(-1); setOpen(false)
  }
  const onKey=(e)=>{
    if(!open&&(e.key==="ArrowDown"||e.key==="Enter")){ setOpen(true); return }
    if(!open) return
    if(e.key==="ArrowDown"){ e.preventDefault(); setHi(h=>Math.min(h+1,list.length-1)) }
    else if(e.key==="ArrowUp"){ e.preventDefault(); setHi(h=>Math.max(h-1,0)) }
    else if(e.key==="Enter"){ e.preventDefault(); if(hi>=0&&hi<list.length) add(list[hi]); else add(q) }
    else if(e.key==="Escape") setOpen(false)
  }
  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2" ref={wrapRef}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-600">빠른 출석 편집</label>
        <select className="rounded border border-gray-300 bg-white px-2 py-1 text-xs" value={teamIdx} onChange={e=>setTeamIdx(Number(e.target.value))}>
          {snapshot.map((_,i)=><option key={i} value={i}>팀 {i+1}</option>)}
        </select>
        <div className="relative min-w-[220px] flex-1">
          <input className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" placeholder="이름 검색 후 추가 (Enter)"
            value={q} onChange={e=>{setQ(e.target.value); setOpen(true); setHi(-1)}} onFocus={()=>setOpen(true)} onKeyDown={onKey}/>
          {open&&list.length>0&&(
            <div ref={listRef} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg" role="listbox" aria-label="가용 선수 목록">
              {list.map((p,idx)=>(
                <button key={p.id} type="button" data-idx={idx}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 ${idx===hi?"bg-gray-100":""}`}
                  onMouseEnter={()=>setHi(idx)} onMouseDown={e=>e.preventDefault()} onClick={()=>add(p)}>
                  <InitialAvatar id={p.id} name={p.name} size={22} badges={(() => { const mem=String(p.membership||"").trim().toLowerCase(); return (mem==='member'||mem.includes('정회원'))?[]:['G'] })()} /><span className="truncate">{p.name}</span>
                  {(p.position||p.pos)==="GK"&&<span className="ml-auto text-[11px] text-gray-400">GK</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs" onClick={()=>add(q)}>추가</button>
      </div>
    </div>
  )
}

/* ------------------------- 매치 카드 ------------------------- */
function MatchCard({ m, players, isAdmin, enableLoadToPlanner, onLoadToPlanner, onDeleteMatch, onUpdateMatch, onUpdateVideos, showTeamOVRForAdmin, hideOVR, latestDraftId }){
  const hydrated=useMemo(()=>hydrateMatch(m,players),[m,players])
  const initialSnap=useMemo(()=>normalizeSnapshot(m,hydrated.teams||[]),[m,hydrated.teams])
  const [draftSnap,setDraftSnap]=useState(initialSnap), [dirty,setDirty]=useState(false)
  const [captainIds, setCaptainIds] = useState([])
  const [quarterScores, setQuarterScores] = useState(null)
  const [localDraftMode, setLocalDraftMode] = useState((m.selectionMode === 'draft') || !!m?.draftMode || !!m?.draft)
  const byId=useMemo(()=>new Map(players.map(p=>[String(p.id),p])),[players])
  const draftTeams=useMemo(()=>draftSnap.map(ids=>ids.map(id=>byId.get(String(id))).filter(Boolean)),[draftSnap,byId])
  const draftCount=useMemo(()=>draftSnap.flat().length,[draftSnap])
  const label=useMemo(()=>formatMatchLabel({...m,snapshot:draftSnap},{withDate:true,withCount:true,count:draftCount}),[m,draftSnap,draftCount])
  const fees=useMemo(()=>deriveFeesFromSnapshot({...m,snapshot:draftSnap},players),[m,draftSnap,players])
  const formatLabel=deriveFormatByLocation(m)
  const isDraftMode = localDraftMode

  // ✅ 이 매치의 선수별 G/A 매핑 계산
  const gaByPlayer = useMemo(()=>extractStatsByPlayerForOneMatch(m), [m])
  
  // ✅ G/A 표시 토글: 기본 꺼짐
  const [showGA, setShowGA] = useState(false)

  // ✅ 초안 변경은 반드시 setSnap 경유 → dirty 플래그 유지
  const setSnap=(next)=>{ setDraftSnap(next); setDirty(true) }
  const resetDraft=()=>{ setDraftSnap(initialSnap); setDirty(false); setLocalDraftMode((m.selectionMode === 'draft') || !!m?.draftMode || !!m?.draft) }
  const saveDraft=()=>{ onUpdateMatch?.(m.id,{snapshot:draftSnap,attendeeIds:draftSnap.flat()}); setDirty(false) }

  useEffect(()=>{ setDraftSnap(initialSnap); setDirty(false); setLocalDraftMode((m.selectionMode === 'draft') || !!m?.draftMode || !!m?.draft) }, [m.id, initialSnap.join('|')])
  useEffect(()=>{
    // initialize captains and quarter scores from m.draft or fallback
    const caps = (m?.draft?.captains && Array.isArray(m.draft.captains)) ? m.draft.captains.map(String) : (Array.isArray(m.captains)?m.captains.map(String):(Array.isArray(m.captainIds)?m.captainIds.map(String):[]))
    if(caps && caps.length) setCaptainIds(caps)
    else setCaptainIds(initialSnap.map(team=>team[0]?String(team[0]):null))
    const qs = (m?.draft?.quarterScores && Array.isArray(m.draft.quarterScores)) ? m.draft.quarterScores : (Array.isArray(m.scores) ? m.scores.map(v=>[v]) : null)
    setQuarterScores(qs || (initialSnap.length? initialSnap.map(()=>[]): null))
  }, [m.id, initialSnap.join('|')])

  const teamCols = Math.max(1, Math.min(4, draftTeams.length))
  const gridStyle = { gridTemplateColumns: `repeat(${teamCols}, minmax(0, 1fr))` }

  // ✅ 유튜브 항목 뽑기
  const ytEntries = useMemo(()=>extractYouTubeEntries(m), [m])

  // ✅ 추가/삭제(배열은 문자열/객체 혼합 호환)
  const addVideo=(url, title)=>{
    const next = [...(m.videos||[]), title ? { url, title } : url]
    onUpdateMatch?.(m.id,{ videos: next, youtubeUrl: m.youtubeUrl ?? null, youtubeTitle: m.youtubeTitle ?? null })
  }
  const removeVideoBySourceIndex=(sourceIndex)=>{
    if (!Array.isArray(m.videos)) return
    const next = m.videos.filter((_,i)=>i!==sourceIndex)
    onUpdateMatch?.(m.id,{ videos: next })
  }

  const locLink = getLocationLink(m)
  const displayedQuarterScores = useMemo(()=>{
    if (m?.draft && Array.isArray(m.draft.quarterScores)) return m.draft.quarterScores
    if (Array.isArray(m.quarterScores)) return m.quarterScores
    if (Array.isArray(m.scores) && Array.isArray(draftSnap) && m.scores.length===draftSnap.length) return draftSnap.map((_,i)=>[m.scores[i]])
    return null
  },[m, draftSnap])

  // ✅ Check if match has any recorded stats (goals or assists)
  const hasStats = useMemo(() => {
    const statsObj = gaByPlayer || {}
    return Object.values(statsObj).some(rec => (rec?.goals > 0 || rec?.assists > 0))
  }, [gaByPlayer])

  // ✅ Current time tracker for real-time status updates
  const [currentTime, setCurrentTime] = useState(Date.now())

  // ✅ Determine match status based on dateISO and stats
  const matchStatus = useMemo(() => {
    if (hasStats) return 'completed' // Has stats = already finished
    if (!m?.dateISO) return null // No date = can't determine
    
    const matchTime = new Date(m.dateISO)
    const now = new Date(currentTime)
    const diffMs = matchTime - now
    const diffHours = diffMs / (1000 * 60 * 60)
    
    // If match hasn't started yet = upcoming
    if (diffMs > 0) return 'upcoming'
    
    // If match started and within 3 hours after = live
    if (diffHours > -3) return 'live'
    
    // If match ended (more than 3 hours ago) but no stats = updating
    if (diffHours <= -3) return 'updating'
    
    return null
  }, [m?.dateISO, hasStats, currentTime])

  // ✅ Countdown timer for upcoming matches
  const [countdown, setCountdown] = useState('')
  
  useEffect(() => {
    if (!m?.dateISO) return
    
    const updateCountdown = () => {
      const matchTime = new Date(m.dateISO)
      const now = new Date()
      const diffMs = matchTime - now
      
      // Update current time to trigger matchStatus recalculation
      setCurrentTime(Date.now())
      
      if (diffMs <= 0) {
        setCountdown('')
        return
      }
      
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)
      
      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`)
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`)
      } else {
        setCountdown(`${seconds}s`)
      }
    }
    
    updateCountdown()
    const interval = setInterval(updateCountdown, 1000) // Update every second
    
    return () => clearInterval(interval)
  }, [m?.dateISO])

  return (
  <li className="relative rounded-2xl border border-gray-100 bg-gradient-to-br from-white via-stone-50 to-stone-100 p-5 shadow-lg">
      {/* Status indicator based on match time and stats */}
      {matchStatus === 'live' && (
        <div className="absolute -top-3 -right-2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white live-badge-natural">
            <span className="inline-block h-2 w-2 rounded-full bg-white live-dot"></span>
            <span>LIVE</span>
          </span>
        </div>
      )}
      {matchStatus === 'upcoming' && (
        <div className="absolute -top-3 -right-2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-300 shadow-sm">
            <span aria-hidden="true">📅</span>
            <span>{countdown || 'UPCOMING'}</span>
          </span>
        </div>
      )}
      {matchStatus === 'updating' && (
        <div className="absolute -top-3 -right-2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white updating-badge-enhanced">
            <span className="inline-block h-2 w-2 rounded-full bg-white updating-dot"></span>
            <span>UPDATING SCORES</span>
          </span>
        </div>
      )}
      {isDraftMode && (
        <div className="absolute -top-3 -left-2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-amber-900 bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-200 shadow-md">
            <img 
              src={draftIcon} 
              alt="Draft" 
              className="w-4 h-4 mr-1 align-middle"
              style={{ filter: 'drop-shadow(0 1px 1px rgba(251,191,36,0.15))' }}
            />
            <span className="align-middle">Draft Match</span>
          </span>
        </div>
      )}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-sm min-w-0 flex-1">
          {/* 데스크탑: 한 줄, 모바일: 두 줄 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <div className="flex items-center gap-2">
              <b className="truncate">{label}</b>
              {dirty && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">수정됨</span>}
            </div>
            {m.location?.name && (
              <div className="text-gray-500 sm:shrink-0">
                @ {locLink ? (
                  <a 
                    href={locLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    title="구글 지도에서 보기"
                  >
                    {m.location.name}
                  </a>
                ) : (
                  <a 
                    href={`https://www.google.com/maps/search/${encodeURIComponent(m.location.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    title="구글 지도에서 보기"
                  >
                    {m.location.name}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <label className="flex items-center gap-1 text-[10px] leading-tight">
              <input type="checkbox" className="w-3 h-3" checked={localDraftMode} onChange={e=>{
                setLocalDraftMode(e.target.checked)
                setDirty(true)
              }} />
              <span>Draft</span>
            </label>
          )}
          {enableLoadToPlanner&&<button className="text-[10px] rounded border border-blue-300 bg-blue-50 text-blue-700 px-1.5 py-0.5 hover:bg-blue-100 transition-colors leading-tight" onClick={()=>onLoadToPlanner?.(m)}>로드</button>}
          {isAdmin&&onDeleteMatch&&<button className="text-[10px] rounded border border-red-300 bg-red-50 text-red-700 px-1.5 py-0.5 hover:bg-red-100 transition-colors leading-tight" onClick={()=>{ if(window.confirm("정말 삭제하시겠어요?\n삭제 시 대시보드의 공격포인트/기록 집계에 영향을 줄 수 있습니다.")) onDeleteMatch(m.id) }}>삭제</button>}
        </div>
      </div>

      <div className="mb-2 text-xs text-gray-600">
        {m.teamCount}팀 ·💰총액 ${fees?.total??0}
        {typeof fees?.memberFee==="number"&&(
          <> · 정회원 ${fees.memberFee}/인</>
        )}
        {fees?.guestCount>0&&typeof fees?.guestFee==="number"&&(
          <> · 게스트 ${fees.guestFee}/인</>
        )}
        {fees?._estimated && <span className="opacity-70"> (추정)</span>}
      </div>

      {displayedQuarterScores && (
        (() => {
          const maxQ = Math.max(...displayedQuarterScores.map(a=>Array.isArray(a)?a.length:1))
          const teamTotals = displayedQuarterScores.map(a=>Array.isArray(a)?a.reduce((s,v)=>s+Number(v||0),0):Number(a||0))
          const maxTotal = Math.max(...teamTotals)
          const winners = teamTotals.map((t,i)=>t===maxTotal?i:-1).filter(i=>i>=0)
          
          // Calculate quarter wins for each team
          const allTeamQuarterWins = displayedQuarterScores.map((_, teamIdx) => {
            return Array.from({length: maxQ}).filter((_,qi) => {
              const scores = displayedQuarterScores.map(teamScores => 
                Array.isArray(teamScores) ? (teamScores[qi] ?? 0) : (qi===0 ? (teamScores||0) : 0)
              )
              const maxScore = Math.max(...scores)
              return scores[teamIdx] === maxScore && scores.filter(s => s === maxScore).length === 1
            }).length
          })
          
          return (
            <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-gray-700">경기 결과</div>
                <div className="text-[10px] text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    쿼터승리
                  </span>
                </div>
              </div>
              
              {/* 컬럼 헤더 */}
              <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1 px-2">
                <span>팀</span>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {Array.from({length:maxQ}).map((_,qi)=>(
                      <span key={qi} className="w-6 text-center">Q{qi+1}</span>
                    ))}
                  </div>
                  <span className="w-8 text-center">승리</span>
                  <span className="w-8 text-right">합계</span>
                </div>
              </div>
              
              <div className="space-y-1">
                {displayedQuarterScores.map((arr,ti)=>{
                  const teamTotal = teamTotals[ti]
                  const isWinner = (winners.length===1 && winners[0]===ti)
                  const quarterWins = allTeamQuarterWins[ti]
                  
                  // Calculate which quarters this team won
                  const wonQuarters = Array.from({length: maxQ}).map((_,qi) => {
                    const scores = displayedQuarterScores.map(teamScores => 
                      Array.isArray(teamScores) ? (teamScores[qi] ?? 0) : (qi===0 ? (teamScores||0) : 0)
                    )
                    const maxScore = Math.max(...scores)
                    return scores[ti] === maxScore && scores.filter(s => s === maxScore).length === 1
                  })
                  
                  return (
                    <div key={ti} className={`flex items-center justify-between text-sm py-2 px-2 rounded ${isWinner ? 'bg-amber-100 font-medium' : 'bg-white'}`}>
                      <span className="flex items-center gap-2">
                        팀 {ti+1}
                        {isWinner && <span className="text-amber-600">🏆</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {Array.from({length:maxQ}).map((_,qi)=>{
                            const v = Array.isArray(arr) ? (arr[qi] ?? 0) : (qi===0? (arr||0) : 0)
                            const wonThisQuarter = wonQuarters[qi]
                            return (
                              <div key={qi} className="w-6 text-center text-xs text-gray-600 relative">
                                <span className={wonThisQuarter ? 'font-semibold' : ''}>{v}</span>
                                {wonThisQuarter && (
                                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <div className="w-8 text-center">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold ${quarterWins > 0 ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400'}`}>
                            {quarterWins}
                          </span>
                        </div>
                        <span className="font-semibold w-8 text-right">{teamTotal}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()
      )}

      {/* 골/어시 토글과 표기 설명을 한 줄에 */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* G/A 표시 슬라이드 토글 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600">⚽🎯</span>
            <button
              onClick={() => setShowGA(prev => !prev)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 ${
                showGA ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
              title={showGA ? "골/어시 숨기기" : "골/어시 표시"}
              role="switch"
              aria-checked={showGA}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  showGA ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-[10px] text-gray-600 whitespace-nowrap">
          <span className="inline-flex items-center gap-1"><CaptainBadge /> <span>주장</span></span>
          <span className="mx-1 text-gray-400">·</span>
          <span className="inline-flex items-center gap-1"><GuestBadge /> <span>게스트</span></span>
        </div>
      </div>

      <div className="grid gap-2 sm:gap-3" style={gridStyle}>
        {draftTeams.map((list,i)=>{
          const kit=kitForTeam(i), nonGK=list.filter(p=>(p.position||p.pos)!=="GK")
          const sum=nonGK.reduce((a,p)=>a+(p.ovr??overall(p)),0), avg=nonGK.length?Math.round(sum/nonGK.length):0
          const capId=(captainIds&&captainIds[i])?String(captainIds[i]):null
          const listOrdered=(isDraftMode&&capId)?[...list].sort((a,b)=>{
            const aid=String(a.id),bid=String(b.id)
            if(aid===capId && bid!==capId) return -1
            if(bid===capId && aid!==capId) return 1
            return 0
          }):list
          
          // compute winner index from quarterScores or m.scores
          let teamTotals = null
          let isWinner = false
          if (Array.isArray(quarterScores) && Array.isArray(quarterScores[i])) {
            teamTotals = quarterScores.map(arr => Array.isArray(arr)?arr.reduce((a,b)=>a+Number(b||0),0):0)
          } else if (Array.isArray(m.scores) && m.scores.length) {
            teamTotals = m.scores.map(Number)
          }
          if (teamTotals && teamTotals.length) {
            const max = Math.max(...teamTotals)
            const winners = teamTotals.map((v,idx)=>v===max?idx:-1).filter(idx=>idx>=0)
            if (winners.length === 1 && winners[0] === i) {
              isWinner = true
            }
          }
          
          return (
            <div key={i} className="overflow-hidden rounded border border-gray-200 relative">
              <div className={`flex items-center justify-between px-3 py-1.5 text-xs ${kit.headerClass} relative z-10`}>
                <div className="font-semibold">팀 {i+1} {isWinner && <span className="ml-2">🏆</span>}</div>
                {isAdmin && !hideOVR
                  ? <div className="opacity-80">{kit.label} · {list.length}명 · <b>팀파워</b> {sum} · 평균 {avg}</div>
                  : <div className="opacity-80">{kit.label} · {list.length}명</div>}
              </div>
              <ul className="divide-y divide-gray-100 relative z-10">
                {isWinner && isDraftMode && m?.id===latestDraftId && <Confetti />}
                {listOrdered.map(p=>{
                  const member=isMember(p.membership)
                  const rec = gaByPlayer[toStr(p.id)] || { goals: 0, assists: 0 }
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      {/* Left block: avatar (with badges) | name | stats */}
                      <div className={`grid items-center gap-2 min-w-0 flex-1 ${showGA ? 'grid-cols-[auto_1fr_auto]' : 'grid-cols-[auto_1fr]'}`}>
                        <div className="shrink-0">
                          {(() => {
                            const isCaptain = isDraftMode && captainIds[i] === String(p.id)
                            const badges = [
                              ...(isCaptain ? ['C'] : []),
                              ...(!member ? ['G'] : []),
                            ]
                            return <InitialAvatar id={p.id} name={p.name} size={22} badges={badges} />
                          })()}
                        </div>
                        <div className="min-w-0 truncate font-medium">
                          {p.name}
                          {(p.position||p.pos)==="GK"&&<em className="ml-1 text-xs font-normal text-gray-400">(GK)</em>}
                        </div>
                        {/* Stats: Goals / Assists (조건부 표시) */}
                        {showGA && (
                          <div className="flex items-center gap-1 justify-self-end">
                            {rec.goals>0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-stone-800 text-white px-1.5 py-0.5 text-[10px]" title="Goals">
                                <span role="img" aria-label="goals">⚽️</span>
                                <span className="tabular-nums">{rec.goals}</span>
                              </span>
                            )}
                            {rec.assists>0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-stone-700 text-white px-1.5 py-0.5 text-[10px]" title="Assists">
                                <span role="img" aria-label="assists">🎯</span>
                                <span className="tabular-nums">{rec.assists}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right block: admin actions */}
                      <span className="flex items-center gap-2 shrink-0">
                        {isAdmin&&(
                          <div className="flex items-center gap-2">
                            {isDraftMode && (
                              <button
                                className="rounded-full border border-amber-200 bg-white w-6 h-6 flex items-center justify-center text-amber-700 hover:bg-amber-50 p-0"
                                title="이 선수를 주장으로 지정"
                                onClick={()=>{
                                  const next=[...(captainIds||[])]
                                  next[i]=String(p.id)
                                  setCaptainIds(next)
                                }}
                                aria-label="주장 지정"
                              >
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="10 2 12.59 7.36 18.51 7.97 14 12.14 15.18 18.02 10 15.1 4.82 18.02 6 12.14 1.49 7.97 7.41 7.36 10 2"/></svg>
                              </button>
                            )}
                            <button
                              className="rounded-full border border-gray-300 bg-white w-6 h-6 flex items-center justify-center text-gray-700 hover:bg-gray-100 p-0"
                              title="이 팀에서 제외 (저장 전 초안)"
                              onClick={()=>setSnap(draftSnap.map((arr,idx)=>idx===i?arr.filter(id=>String(id)!==String(p.id)):arr))}
                              aria-label="팀에서 제외"
                            >
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
                            </button>
                          </div>
                        )}
                      </span>
                    </li>
                  )
                })}
                {list.length===0&&<li className="px-3 py-2 text-xs text-gray-400">팀원 없음</li>}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Admin: Draft editors (simplified UI) */}
      {isAdmin && isDraftMode && (() => {
        // Normalize quarter scores to match current team count
        const teamLen = draftTeams.length
        const qs = (quarterScores && Array.isArray(quarterScores))
          ? quarterScores.map(a => Array.isArray(a) ? a.slice() : [])
          : Array.from({ length: teamLen }, () => [])
        while (qs.length < teamLen) qs.push([])
        if (qs.length > teamLen) qs.length = teamLen
        const maxQ = Math.max(0, ...qs.map(a => a.length))

        return (

          <div className="mt-3 space-y-3">

            {/* Quarter scores: global grid */}
            <div className="rounded border p-3 bg-white">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">쿼터 점수 (전체 팀)</div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border px-2 py-1 text-sm"
                    onClick={()=>{
                      const next = qs.map(arr => [...arr, 0])
                      setQuarterScores(next)
                    }}
                  >Add Quarter</button>
                  <button
                    className="rounded border px-2 py-1 text-sm disabled:opacity-50"
                    disabled={maxQ===0}
                    onClick={()=>{
                      const newLen = Math.max(0, maxQ - 1)
                      const next = qs.map(arr => arr.slice(0, newLen))
                      setQuarterScores(next)
                    }}
                  >Remove Last</button>
                </div>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm table-auto border-collapse">
                  <thead>
                    <tr className="text-xs text-stone-600">
                      <th className="text-left px-2 py-1">팀</th>
                      {Array.from({length: Math.max(1, maxQ)}).map((_,qi)=>(
                        <th key={qi} className="px-2 py-1 text-center">Q{qi+1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draftTeams.map((_, ti) => (
                      <tr key={`qrow-${ti}`}> 
                        <td className="px-2 py-1">팀 {ti+1}</td>
                        {Array.from({length: Math.max(1, maxQ)}).map((_,qi)=>{
                          const val = qs[ti][qi] ?? 0
                          return (
                            <td key={`qcell-${ti}-${qi}`} className="px-1 py-1 text-center">
                              <input
                                type="number"
                                min="0"
                                max="99"
                                inputMode="numeric"
                                className="w-12 sm:w-16 rounded border border-gray-300 bg-white text-stone-900 px-1 py-1 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={val}
                                onChange={e=>{
                                  const next = qs.map(a=>a.slice())
                                  let n = Number(e.target.value||0)
                                  if (n < 0) n = 0
                                  if (n > 99) n = 99
                                  // ensure length
                                  while(next[ti].length < qi+1) next[ti].push(0)
                                  next[ti][qi] = n
                                  setQuarterScores(next)
                                }}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 mt-2">
              <button className="rounded border px-3 py-1.5 text-xs sm:text-sm" title="쿼터 점수만 모두 비웁니다." onClick={()=>{
                setQuarterScores(initialSnap.map(()=>[]))
              }}>Clear All Quarters</button>
              <button className="rounded border px-3 py-1.5 text-xs sm:text-sm" title="주장/쿼터 점수 입력값을 모두 비웁니다." onClick={()=>{
                // reset editors to a clearly empty state
                setCaptainIds(initialSnap.map(()=>null))
                setQuarterScores(initialSnap.map(()=>[]))
              }}>Reset Draft Data (Clear)</button>
              <button className="rounded bg-blue-600 text-white px-3 py-1.5 text-xs sm:text-sm" onClick={()=>{
                // save snapshot + draft info + draft mode
                const patch = { 
                  snapshot: draftSnap, 
                  attendeeIds: draftSnap.flat(), 
                  draft: { ...(m.draft||{}), captains: captainIds, quarterScores }
                }
                if (localDraftMode) {
                  patch.selectionMode = 'draft'
                } else {
                  patch.selectionMode = null
                  patch.draftMode = null
                  patch.draft = null
                }
                onUpdateMatch?.(m.id, patch); setDirty(false)
              }}>저장 (Draft)</button>
            </div>
          </div>
        )
      })()}

      {isAdmin&&<QuickAttendanceEditor players={players} snapshot={draftSnap} onDraftChange={setSnap}/>}
      {isAdmin&&dirty&&(
        <div className="mt-3 flex items-center justify-end gap-2">
          <button className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm" onClick={resetDraft} title="변경사항 취소">취소</button>
          <button className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm hover:bg-blue-700" onClick={saveDraft} title="변경사항 저장">저장</button>
        </div>
      )}

      {/* 🎥 유튜브: 카드 내부 썸네일 + 어드민 입력 */}
      <div className="mt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600">🎥 Match Video(s)</div>

        {/* 썸네일 그리드 (있는 경우에만) */}
        {ytEntries.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ytEntries.map((e,i)=>(
              <div key={`${e.id}-${i}`} className="relative">
                <YouTubeThumb
                  videoId={e.id}
                  title={e.title}
                  dateKey={m?.dateISO || m?.date || ""}
                />
                {/* 어드민만 삭제 버튼 표시 */}
                {isAdmin && typeof e.sourceIndex === 'number' && (
                  <button
                    className="absolute right-2 top-2 rounded bg-white/95 px-2 py-0.5 text-[11px] text-red-700 shadow hover:bg-white"
                    title="삭제"
                    onClick={()=>removeVideoBySourceIndex(e.sourceIndex)}
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500">등록된 비디오 링크가 없습니다.</div>
        )}

        {/* 어드민: 링크+제목 추가 */}
        {isAdmin && (
          <VideoAdder onAdd={addVideo}/>
        )}
      </div>
    </li>
  )
}

/* -------------------- 최신순 정렬 & 리스트 ------------------- */
function _ts(m){
  const cand = m?.dateISO || m?.dateIso || m?.dateiso || m?.date || m?.dateStr
  const t = cand ? new Date(cand).getTime() : NaN
  if(!Number.isFinite(t)) return 0
  return t
}

export default function SavedMatchesList({
  matches=[],
  players=[],
  isAdmin=false,
  enableLoadToPlanner=false,
  onLoadToPlanner,
  onDeleteMatch,
  onUpdateMatch,
  showTeamOVRForAdmin=false,
  hideOVR=false
}){
  const ordered = useMemo(()=>matches.slice().sort((a,b)=>_ts(b)-_ts(a)),[matches])
  // ✅ 가장 최신 draft 매치의 ID를 계산
  const latestDraftId = useMemo(()=>{
    for (const mm of ordered){
      if (mm?.selectionMode === 'draft' || mm?.draftMode || mm?.draft) return mm.id
    }
    return null
  }, [ordered])
  return (
    <>
      <ul className="grid gap-6">
        {ordered.map((m, idx) => (
          <React.Fragment key={m.id}>
            <MatchCard
              m={m}
              players={players}
              isAdmin={isAdmin}
              enableLoadToPlanner={enableLoadToPlanner}
              onLoadToPlanner={onLoadToPlanner}
              onDeleteMatch={onDeleteMatch}
              onUpdateMatch={onUpdateMatch}
              showTeamOVRForAdmin={showTeamOVRForAdmin}
              hideOVR={hideOVR}
              latestDraftId={latestDraftId}
            />
            {idx < ordered.length - 1 && (
              <li aria-hidden="true" className="mx-2 my-0 border-t border-dashed border-gray-200" />
            )}
          </React.Fragment>
        ))}
        {ordered.length===0&&<li className="text-sm text-stone-500">표시할 매치가 없습니다.</li>}
      </ul>
      
      {/* CSS 스타일 */}
      <style>{`
        @keyframes livePulse {
          0%, 100% {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
            transform: scale(1);
          }
          50% {
            background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
            box-shadow: 0 0 12px rgba(239, 68, 68, 0.8);
            transform: scale(1.02);
          }
        }
        
        @keyframes liveDotBreathe {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.2);
          }
        }
        
        .live-badge-natural {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          border: 1px solid #f87171;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
          animation: livePulse 3s infinite ease-in-out;
          will-change: transform, box-shadow, background;
        }
        
        .live-dot {
          animation: liveDotBreathe 2s infinite ease-in-out;
          will-change: opacity, transform;
        }
        
        @keyframes updatingPulse {
          0%, 100% {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            box-shadow: 0 0 12px rgba(245, 158, 11, 0.6), 0 0 24px rgba(245, 158, 11, 0.2);
            transform: scale(1);
          }
          50% {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            box-shadow: 0 0 20px rgba(245, 158, 11, 0.8), 0 0 40px rgba(245, 158, 11, 0.3);
            transform: scale(1.05);
          }
        }
        
        @keyframes updatingBackgroundShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        @keyframes updatingDotPulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          25% {
            opacity: 0.7;
            transform: scale(1.3);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.1);
          }
          75% {
            opacity: 0.8;
            transform: scale(1.2);
          }
        }
        
        .updating-badge-enhanced {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          background-size: 200% 100%;
          border: 1px solid #fbbf24;
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.6), 0 0 24px rgba(245, 158, 11, 0.2);
          animation: 
            updatingPulse 2.5s infinite ease-in-out,
            updatingBackgroundShift 3s infinite ease-in-out;
          will-change: transform, box-shadow, background, background-position;
        }
        
        .updating-dot {
          animation: updatingDotPulse 1.8s infinite ease-in-out;
          will-change: opacity, transform;
        }
        
        /* 접근성 - 애니메이션 감소 선호 사용자 */
        @media (prefers-reduced-motion: reduce) {
          .live-badge-natural {
            animation: none !important;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
          }
          
          .live-dot {
            animation: none !important;
          }
          
          .updating-badge-enhanced {
            animation: none !important;
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
          }
          
          .updating-dot {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}
