import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, ChevronDown } from 'lucide-react'

const SUPPORTED_LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' }
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const containerRef = React.useRef(null)

  const currentLang = i18n.language || 'ko'

  const handleSelect = useCallback((code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('sfm:language', code)
    setMenuOpen(false)
  }, [i18n])

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [menuOpen])

  const currentLabel = SUPPORTED_LANGUAGES.find(l => l.code === currentLang)?.label || 'KO'

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Change language (${currentLang.toUpperCase()})`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-stone-300 bg-white p-0.5 text-stone-700 shadow-sm hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 transition"
      >
        <Languages size={11} aria-hidden="true" />
        <span className="sr-only">{currentLang.toUpperCase()}</span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-1 w-32 rounded-lg border border-stone-200 bg-white p-1 text-[11px] shadow-lg z-50">
          <div className="flex flex-col gap-0.5">
            {SUPPORTED_LANGUAGES.map(({ code, label, flag }) => {
              const active = currentLang === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleSelect(code)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    active ? 'bg-emerald-100 text-emerald-800' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>{flag}</span>
                    <span>{label}</span>
                  </span>
                  {active && <span className="text-[9px] uppercase">active</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
