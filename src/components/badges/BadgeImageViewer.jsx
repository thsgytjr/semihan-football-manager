import React, { useState } from 'react'
import { X } from 'lucide-react'

// Fullscreen image viewer that allows native pinch-to-zoom on mobile.
// Keeps minimal JS and lets the browser handle gestures. Do not block touch events.
export default function BadgeImageViewer({ src, alt = '', onClose }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  if (!src) return null

  return (
    <div
      role="dialog"
      aria-label={alt || 'Badge image viewer'}
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/90 p-4 animate-fadeIn"
      style={{ touchAction: 'auto' }}
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close image viewer"
        onClick={(e) => { e.stopPropagation(); onClose && onClose() }}
        className="absolute right-4 top-4 z-[1510] rounded-full p-2 text-white bg-black/30 hover:bg-black/50 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="max-w-full max-h-full flex items-center justify-center">
        {/* 로딩 스피너 */}
        {!imageLoaded && !imageError && (
          <div className="absolute flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            <span className="text-white text-sm">이미지 로딩 중...</span>
          </div>
        )}
        
        {/* 에러 메시지 */}
        {imageError && (
          <div className="absolute flex flex-col items-center gap-3 text-white">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-red-500/20">
              <X className="w-6 h-6" />
            </div>
            <span className="text-sm">이미지를 불러올 수 없습니다</span>
          </div>
        )}
        
        <img
          src={src}
          alt={alt}
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`block transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            touchAction: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
}
