'use client';

import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Convenience hook for translation.
 * Returns { t, lang, setLang } from LanguageContext.
 *
 * Usage:
 *   const { t, lang, setLang } = useTranslation();
 *   t('common.confirm')              → "확인" or "Confirm"
 *   t('chat.max_images', { max: 5 }) → "이미지는 최대 5장까지..."
 */
export function useTranslation() {
  return useLanguage();
}
