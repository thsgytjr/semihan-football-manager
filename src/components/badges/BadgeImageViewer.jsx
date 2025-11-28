import React from 'react'
import { X } from 'lucide-react'

// Fullscreen image viewer that allows native pinch-to-zoom on mobile.
// Keeps minimal JS and lets the browser handle gestures. Do not block touch events.
export default function BadgeImageViewer({ src, alt = '', onClose }) {
  if (!src) return null

  return (
    <div
      role="dialog"
      aria-label={alt || 'Badge image viewer'}
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/90 p-4"
      style={{ touchAction: 'auto' }}
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close image viewer"
        onClick={(e) => { e.stopPropagation(); onClose && onClose() }}
        className="absolute right-4 top-4 z-[1510] rounded-full p-2 text-white bg-black/30 hover:bg-black/50"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="max-w-full max-h-full flex items-center justify-center">
        <img
          src={src}
          alt={alt}
          decoding="async"
          // let browser perform native pinch/zoom; keep object-contain so image fits initially
          className="block"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            // Don't stop pointer events — allow pinch/pan
            touchAction: 'auto'
          }}
          onClick={(e) => e.stopPropagation()} // clicking image shouldn't close viewer
        />
      </div>
    </div>
  )
}
