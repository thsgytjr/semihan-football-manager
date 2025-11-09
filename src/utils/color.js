// src/utils/color.js
// Compute contrasting text color for a given hex background
export function getTextColor(bgHex) {
  if (!bgHex || typeof bgHex !== 'string') return '#000000'
  const hex = bgHex.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 155 ? '#000000' : '#ffffff'
}
