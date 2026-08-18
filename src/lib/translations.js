/**
 * Translation utility for i18n support
 */

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

// Import translation files
import arTranslations from '../../locales/ar/common.json';
import enTranslations from '../../locales/en/common.json';

const translations = {
  ar: arTranslations,
  en: enTranslations,
};

/**
 * Get translation for a key
 * @param {string} key - Translation key (e.g., 'navigation.dashboard')
 * @param {object} params - Parameters to replace in translation
 * @param {string} locale - Locale code
 * @returns {string} Translated string
 */
export function getTranslation(key, params = {}, locale = 'ar') {
  const keys = key.split('.');
  let translation = translations[locale] || translations.ar;
  
  for (const k of keys) {
    translation = translation?.[k];
    if (!translation) {
      // Fallback to Arabic if translation not found
      translation = translations.ar;
      for (const fallbackKey of keys) {
        translation = translation?.[fallbackKey];
        if (!translation) return key;
      }
      break;
    }
  }
  
  if (typeof translation !== 'string') {
    return key;
  }
  
  // Replace parameters in translation
  return translation.replace(/\{(\w+)\}/g, (match, param) => {
    return params[param] || match;
  });
}

/**
 * Hook to use translations in components
 * @returns {object} Translation functions and locale info
 */
export function useTranslations() {
  const pathname = usePathname();
  
  // Extract locale from pathname - now expects /[lang]/path format
  const locale = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0 && ['ar', 'en'].includes(segments[0])) {
      return segments[0];
    }
    return 'ar'; // Default to Arabic
  }, [pathname]);
  
  const t = useMemo(() => {
    return (key, params = {}) => getTranslation(key, params, locale);
  }, [locale]);
  
  const isRTL = useMemo(() => {
    return locale === 'ar';
  }, [locale]);
  
  return {
    t,
    locale,
    isRTL,
  };
}

/**
 * Get all available locales
 * @returns {array} Array of locale codes
 */
export function getLocales() {
  return Object.keys(translations);
}

/**
 * Get locale direction
 * @param {string} locale - Locale code
 * @returns {string} 'rtl' or 'ltr'
 */
export function getLocaleDirection(locale = 'ar') {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export default useTranslations;
