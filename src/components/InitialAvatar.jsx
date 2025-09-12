import React from "react"

export default function InitialAvatar({ id, name, size = 24 }) {
  const initial = (name || "?").trim().charAt(0)?.toUpperCase() || "?"
  const color = "#" + stringToColor(String(id || "seed"))
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-semibold select-none"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.5), backgroundColor: color }}
    >
      {initial}
    </div>
  )
}

export function stringToColor(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return ((h >>> 0).toString(16) + "000000").substring(0, 6)
}
