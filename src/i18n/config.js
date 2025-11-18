import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import translationKO from './locales/ko.json'
import translationEN from './locales/en.json'

const resources = {
  ko: {
    translation: translationKO
  },
  en: {
    translation: translationEN
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ko',
    lng: localStorage.getItem('sfm:language') || 'ko',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'sfm:language'
    }
  })

export default i18n
