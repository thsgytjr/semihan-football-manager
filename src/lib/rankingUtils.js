// src/lib/rankingUtils.js
// Shared utilities for ranking display and styling

/**
 * Get background colors for rank position
 * @param {number} rank - The rank position (1, 2, 3, etc.)
 * @returns {{rowBg: string, cellBg: string}} - Tailwind classes for row and cell backgrounds
 */
export function rankTone(rank) {
  if (rank === 1) return { rowBg: 'bg-yellow-50', cellBg: 'bg-yellow-50' }
  if (rank === 2) return { rowBg: 'bg-gray-50', cellBg: 'bg-gray-50' }
  if (rank === 3) return { rowBg: 'bg-orange-100', cellBg: 'bg-orange-100' }
  return { rowBg: '', cellBg: '' }
}
