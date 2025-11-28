const SUPABASE_PUBLIC_PATTERN = /supabase\.co\/storage\/v1\/object\/public\//

/**
 * Apply lightweight, CDN-level transforms (width/quality/format) when the source
 * URL supports Supabase's image optimization endpoints. Falls back to the
 * original URL when transforms are not supported or already applied.
 *
 * @param {string} url
 * @param {object} options
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {number} [options.quality=75]
 * @param {string} [options.format='webp']
 * @param {('cover'|'contain'|'fill')} [options.resize='cover']
 * @returns {string}
 */
export function optimizeImageUrl(url, {
  width,
  height,
  quality = 75,
  format = 'webp',
  resize = 'cover'
} = {}) {
  if (!url || typeof url !== 'string') return url
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  // Only Supabase public storage URLs support the query-based transforms.
  if (!SUPABASE_PUBLIC_PATTERN.test(trimmed)) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)

    if (width && !parsed.searchParams.has('width')) {
      parsed.searchParams.set('width', Math.max(1, Math.round(width)))
    }

    if (height && !parsed.searchParams.has('height')) {
      parsed.searchParams.set('height', Math.max(1, Math.round(height)))
    }

    if (!parsed.searchParams.has('quality')) {
      parsed.searchParams.set('quality', Math.max(10, Math.min(100, Math.round(quality))))
    }

    if (format && !parsed.searchParams.has('format')) {
      parsed.searchParams.set('format', format)
    }

    if (resize && !parsed.searchParams.has('resize')) {
      parsed.searchParams.set('resize', resize)
    }

    return parsed.toString()
  } catch (err) {
    // If URL parsing fails (e.g., relative URL), just return the original.
    return trimmed
  }
}
