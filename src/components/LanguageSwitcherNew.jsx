import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const SUPPORTED_LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' }
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef(null)

  const currentLang = i18n.language || 'ko'

  const handleSelect = useCallback((code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('sfm:language', code)
    setMenuOpen(false)
  }, [i18n])

  useEffect(() => {
    if (!menuOpen) return

    const handleOutside = (event) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)

    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [menuOpen])

  const currentFlag = SUPPORTED_LANGUAGES.find(l => l.code === currentLang)?.flag || '🌐'

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="언어 변경"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white text-lg leading-none shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 ${
          menuOpen ? 'border-emerald-500' : 'border-stone-300 hover:border-stone-400'
        }`}
      >
        <span className="pointer-events-none select-none">{currentFlag}</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-1 min-w-[110px] rounded-lg border border-stone-200 bg-white p-1 text-[11px] shadow-lg z-50">
          <div className="flex flex-col gap-0.5">
            {SUPPORTED_LANGUAGES.map(({ code, label, flag }) => {
              const active = currentLang === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleSelect(code)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 font-medium transition ${
                    active ? 'bg-emerald-100 text-emerald-800' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span className="text-base leading-none">{flag}</span>
                  <span>{label}</span>
                  {active && <span className="ml-auto text-[9px] uppercase text-emerald-700">now</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
