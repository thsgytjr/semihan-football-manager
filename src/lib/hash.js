// src/lib/hash.js
// Simple helper to hash text values on the client before sending to the server

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashText(text) {
  if (!text || typeof text !== 'string') return null
  try {
    if (crypto?.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(text)
      const digest = await crypto.subtle.digest('SHA-256', data)
      return bufferToHex(digest)
    }
  } catch {}
  // Fallback: simple hash (non-cryptographic)
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return hash.toString(16)
}
