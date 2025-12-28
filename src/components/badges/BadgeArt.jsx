// src/components/badges/BadgeArt.jsx
// Inline SVG artwork for each badge slug (modern illustrated style)
import React, { useState, useEffect, useRef } from 'react'

// Common gradients & defs reused per artwork
function GradientDefs() {
  return (
    <defs>
      <linearGradient id="grad-orange" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ff9d2e" />
        <stop offset="100%" stopColor="#ff6a00" />
      </linearGradient>
      <linearGradient id="grad-violet" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#a78bfa" />
      </linearGradient>
      <linearGradient id="grad-cyan" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0ea5e9" />
      </linearGradient>
      <linearGradient id="grad-emerald" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="grad-magenta" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#db2777" />
      </linearGradient>
      <radialGradient id="flare" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
        <stop offset="70%" stopColor="rgba(255,255,255,0.15)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
    </defs>
  )
}

// Artwork components per slug
const ART = {
  'total-goals': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#121212" />
      {[0,1,2].map(i => (
        <g key={i} transform={`rotate(${i*25} 50 50)`}>
          <circle cx={30 + i*6} cy={40 - i*2} r="10" fill="url(#grad-orange)" opacity={0.9 - i*0.2} />
          <path d="M20 50 Q35 35 50 50 T80 55" stroke="url(#grad-orange)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.6 - i*0.15}/>
        </g>
      ))}
      <circle cx="50" cy="50" r="40" fill="url(#flare)" />
    </g>
  ),
  'total-assists': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#141414" />
      <circle cx="50" cy="50" r="26" stroke="url(#grad-violet)" strokeWidth="4" fill="none" />
      <circle cx="50" cy="50" r="4" fill="url(#grad-violet)" />
      <path d="M20 70 L40 55 L55 60 L80 35" stroke="url(#grad-violet)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M75 30 l8 2 -6 6" stroke="url(#grad-violet)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="40" fill="url(#flare)" />
    </g>
  ),
  'point-collector': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#151515" />
      <path d="M50 18 L62 44 L90 46 L68 62 L75 88 L50 72 L25 88 L32 62 L10 46 L38 44 Z" fill="url(#grad-magenta)" stroke="#ffffff22" strokeWidth="2" />
      <circle cx="50" cy="50" r="34" fill="url(#flare)" />
    </g>
  ),
  'appearance-ironman': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#101010" />
      <rect x="24" y="26" width="52" height="52" rx="10" fill="#0a2e38" stroke="url(#grad-cyan)" strokeWidth="3" />
      {[0,1,2,3,4].map(row => (
        [0,1,2,3,4].map(col => {
          const filled = row < 3 || (row===3 && col<3) // streak highlight
          return <rect key={`${row}-${col}`} x={30+col*8} y={32+row*8} width="5" height="5" rx="1" fill={filled? 'url(#grad-cyan)' : '#1e3a3a'} opacity={filled?1:0.4} />
        })
      ))}
      <circle cx="50" cy="50" r="36" fill="url(#flare)" />
    </g>
  ),
  'clean-sheet-guardian': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#0f1110" />
      <rect x="22" y="34" width="56" height="28" rx="6" fill="#062b1d" stroke="url(#grad-emerald)" strokeWidth="3" />
      <path d="M36 60 Q50 40 64 60" stroke="url(#grad-emerald)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M32 58 L34 46 L42 44 L40 59 Z" fill="#10b981" opacity="0.75" />
      <path d="M68 58 L66 46 L58 44 L60 59 Z" fill="#10b981" opacity="0.75" />
      <circle cx="50" cy="50" r="38" fill="url(#flare)" />
    </g>
  ),
  'first-goal': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#121212" />
      <circle cx="50" cy="50" r="16" fill="url(#grad-orange)" stroke="#ffffff33" strokeWidth="3" />
      <path d="M50 24 L50 12" stroke="url(#grad-orange)" strokeWidth="4" strokeLinecap="round" />
      <path d="M50 76 L50 88" stroke="url(#grad-orange)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="50" r="34" fill="url(#flare)" />
    </g>
  ),
  'hat-trick-hero': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#161316" />
      {[0,1,2].map(i => (
        <circle key={i} cx={40 + i*10} cy={40 + i*4} r="9" fill="url(#grad-magenta)" opacity={1 - i*0.2} />
      ))}
      <path d="M30 70 C45 45 55 45 70 70" stroke="url(#grad-magenta)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="50" r="38" fill="url(#flare)" />
    </g>
  ),
  'multi-goal-collector': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#191412" />
      {[0,1,2,3].map(i => (
        <circle key={i} cx={28 + i*10} cy={70 - i*6} r="7" fill="url(#grad-orange)" opacity={0.85 - i*0.15} />
      ))}
      <path d="M24 74 L80 30" stroke="url(#grad-orange)" strokeWidth="2" strokeDasharray="3 4" />
      <circle cx="50" cy="50" r="36" fill="url(#flare)" />
    </g>
  ),
  'playmaker-night': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#0d0f24" />
      <circle cx="50" cy="50" r="28" fill="#1e2140" stroke="url(#grad-violet)" strokeWidth="3" />
      <path d="M28 60 Q50 40 72 60" stroke="url(#grad-violet)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="50" r="4" fill="url(#grad-violet)" />
      <circle cx="50" cy="50" r="40" fill="url(#flare)" />
    </g>
  ),
  'consistent-scorer': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#181818" />
      <circle cx="50" cy="50" r="30" stroke="url(#grad-orange)" strokeWidth="4" fill="none" />
      {[0,90,180,270].map(a => (
        <path key={a} d="M50 20 L50 32" stroke="url(#grad-orange)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="34" fill="url(#flare)" />
    </g>
  ),
  'attendance-streak': () => (
    <g>
      <GradientDefs />
      <circle cx="50" cy="50" r="46" fill="#102022" />
      <rect x="28" y="30" width="44" height="40" rx="8" fill="#0f2f33" stroke="url(#grad-cyan)" strokeWidth="3" />
      {[0,1,2,3].map(i => (
        <rect key={i} x={34 + i*8} y={36} width="6" height="6" rx="2" fill="url(#grad-cyan)" />
      ))}
      {[0,1,2].map(i => (
        <rect key={`r${i}`} x={34 + i*8} y={46} width="6" height="6" rx="2" fill="url(#grad-cyan)" opacity={i===2?0.35:1} />
      ))}
      <circle cx="50" cy="50" r="36" fill="url(#flare)" />
    </g>
  )
}

export function BadgeArt({ slug }) {
  const [isInView, setIsInView] = useState(false)
  const svgRef = useRef(null)
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // 뷰포트에 들어오면 렌더링
        setIsInView(entry.isIntersecting)
      },
      { 
        threshold: 0.1,
        rootMargin: '100px' // 100px 전에 미리 로드
      }
    )
    
    if (svgRef.current) {
      observer.observe(svgRef.current)
    }
    
    return () => {
      if (svgRef.current) {
        observer.unobserve(svgRef.current)
      }
    }
  }, [])
  
  const Comp = ART[slug]
  
  // 뷰포트에 없으면 placeholder만 렌더링
  if (!isInView) {
    return (
      <svg ref={svgRef} viewBox="0 0 100 100" role="img" aria-label="badge-loading" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="46" fill="#f5f5f5" />
        <circle cx="50" cy="50" r="18" fill="#d4d4d8" />
      </svg>
    )
  }
  
  if (!Comp) {
    return (
      <svg ref={svgRef} viewBox="0 0 100 100" role="img" aria-label="badge-art" xmlns="http://www.w3.org/2000/svg">
        <GradientDefs />
        <circle cx="50" cy="50" r="46" fill="#1c1c1c" />
        <circle cx="50" cy="50" r="18" fill="url(#grad-magenta)" />
      </svg>
    )
  }
  return (
    <svg ref={svgRef} viewBox="0 0 100 100" role="img" aria-label={slug} xmlns="http://www.w3.org/2000/svg">
      {Comp()}
    </svg>
  )
}

// React.memo로 불필요한 리렌더링 방지
export default React.memo(BadgeArt, (prevProps, nextProps) => {
  return prevProps.slug === nextProps.slug
})
