/**
 * src/i18n/index.ts
 * Internationalization setup using i18next + react-i18next.
 *
 * Supported languages: English (en), Spanish (es).
 * The active language is persisted in AppState.language and applied on boot.
 *
 * Usage in components:
 *   import { useTranslation } from 'react-i18next'
 *   const { t } = useTranslation()
 *   <span>{t('sidebar.newNote')}</span>
 *
 * To change language at runtime:
 *   import i18n from './i18n'
 *   i18n.changeLanguage('es')
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import es from './locales/es.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: 'en',
  fallbackLng: 'en',
  // React already escapes content — no need for i18next to double-escape
  interpolation: { escapeValue: false },
  // Silently return the key as fallback rather than throwing
  missingKeyHandler: false,
})

export default i18n
