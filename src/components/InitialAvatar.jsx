import React from "react"

/**
 * InitialAvatar
 * - Renders a colored circular avatar with the initial
 * - Optional small corner badges (e.g., ['C','G']) overlayed on the avatar
 */
export default function InitialAvatar({ id, name, size = 24, badges = [] }) {
  const initial = (name || "?").trim().charAt(0)?.toUpperCase() || "?"
  const color = "#" + stringToColor(String(id || "seed"))

  const badgeSize = Math.max(10, Math.round(size * 0.45))
  const badgeFont = Math.max(8, Math.round(badgeSize * 0.55))
  const badgeGap = Math.max(2, Math.round(badgeSize * 0.2))

  const renderBadge = (label, idx) => {
    const isCaptain = String(label).toUpperCase() === 'C'
    const isGuest = String(label).toUpperCase() === 'G'
    const bgCls = isCaptain ? 'bg-amber-100 border-amber-300 text-amber-900' : isGuest ? 'bg-rose-100 border-rose-300 text-rose-900' : 'bg-white border-stone-300 text-stone-800'
    const title = isCaptain ? '주장' : isGuest ? '게스트' : String(label)
    // Offset badges from right to left
    const right = idx * (badgeSize - badgeGap)
    return (
      <span
        key={`${label}-${idx}`}
        title={title}
        className={`absolute bottom-0 rounded-full border shadow-sm ${bgCls} inline-flex items-center justify-center select-none`}
        style={{
          width: badgeSize,
          height: badgeSize,
          right,
          transform: 'translate(25%, 25%)',
          fontSize: badgeFont,
          lineHeight: 1,
        }}
      >
        {String(label).toUpperCase()}
      </span>
    )
  }

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-full text-white font-semibold select-none"
        style={{ fontSize: Math.max(10, size * 0.5), backgroundColor: color }}
      >
        {initial}
      </div>
      {/* badges overlay: render from right to left */}
      {Array.isArray(badges) && badges.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute bottom-0 right-0 flex items-center">
            {badges.slice(0, 3).map((b, i) => renderBadge(b, i))}
          </div>
        </div>
      )}
    </div>
  )
}

export function stringToColor(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return ((h >>> 0).toString(16) + "000000").substring(0, 6)
}
