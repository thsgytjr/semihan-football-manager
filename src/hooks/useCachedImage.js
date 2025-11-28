import { useEffect, useState } from 'react'

const objectUrlCache = new Map()
const inflightMap = new Map()

function fetchAndCache(url) {
  if (!url) return Promise.resolve(null)
  if (objectUrlCache.has(url)) {
    return Promise.resolve(objectUrlCache.get(url))
  }
  if (inflightMap.has(url)) {
    return inflightMap.get(url)
  }

  const controller = new AbortController()
  const promise = fetch(url, { signal: controller.signal })
    .then((res) => {
      if (!res.ok) throw new Error('Failed to fetch image')
      return res.blob()
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      objectUrlCache.set(url, objectUrl)
      inflightMap.delete(url)
      return objectUrl
    })
    .catch((err) => {
      inflightMap.delete(url)
      throw err
    })

  inflightMap.set(url, promise)
  return promise
}

export default function useCachedImage(url) {
  const [cachedSrc, setCachedSrc] = useState(() => (url ? objectUrlCache.get(url) || null : null))

  useEffect(() => {
    if (!url) {
      setCachedSrc(null)
      return
    }
    let cancelled = false

    if (objectUrlCache.has(url)) {
      setCachedSrc(objectUrlCache.get(url))
      return undefined
    }

    fetchAndCache(url)
      .then((objectUrl) => {
        if (!cancelled) {
          setCachedSrc(objectUrl)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCachedSrc(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return cachedSrc
}

export function clearImageCache() {
  objectUrlCache.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
  objectUrlCache.clear()
  inflightMap.clear()
}
