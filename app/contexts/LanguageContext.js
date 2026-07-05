'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ko from '@/lib/i18n/ko.json';

const SUPPORTED_LANGS = ['ko', 'en'];
const DEFAULT_LANG = 'ko';
const STORAGE_KEY = 'hanimo-webui-lang';

const LanguageContext = createContext(null);

/**
 * Resolve a dot-notation key (e.g. "common.confirm") from a nested object.
 */
function resolve(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [mounted, setMounted] = useState(false);
  const [dictionaryVersion, setDictionaryVersion] = useState(0);
  const translationsRef = useRef({ ko });

  // Hydrate from localStorage on mount
  useEffect(() => {
    let initialLang = DEFAULT_LANG;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored)) {
        initialLang = stored;
      } else {
        // Detect browser language
        const browserLang = navigator.language?.slice(0, 2);
        if (SUPPORTED_LANGS.includes(browserLang)) {
          initialLang = browserLang;
        }
      }
    } catch {
      // localStorage not available
    }
    if (initialLang !== DEFAULT_LANG) {
      import(`@/lib/i18n/${initialLang}.json`).then((mod) => {
        translationsRef.current[initialLang] = mod.default;
        setLangState(initialLang);
        setMounted(true);
      });
    } else {
      setLangState(initialLang);
      setMounted(true);
    }
  }, []);

  // Sync html lang attribute
  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = lang;
    }
  }, [lang, mounted]);

  const setLang = useCallback((newLang) => {
    if (!SUPPORTED_LANGS.includes(newLang)) return;
    const apply = () => {
      setLangState(newLang);
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
      } catch {
        // localStorage not available
      }
    };
    if (translationsRef.current[newLang]) {
      apply();
    } else {
      import(`@/lib/i18n/${newLang}.json`).then((mod) => {
        translationsRef.current[newLang] = mod.default;
        apply();
      });
    }
  }, []);

  /**
   * Translate a key with optional interpolation.
   * Usage: t('common.confirm') → "확인"
   *        t('sidebar.room_delete_message', { roomName: 'Test' }) → '"Test" 방을 삭제하시겠습니까?'
   */
  const t = useCallback(
    (key, params) => {
      const dict = translationsRef.current[lang] || translationsRef.current[DEFAULT_LANG];
      let value = resolve(dict, key);

      // Fallback to default language if key not found
      if (value === undefined) {
        value = resolve(translationsRef.current[DEFAULT_LANG], key);
      }

      // If still not found, return the key itself
      if (value === undefined) {
        return key;
      }

      // Interpolation: replace {param} with values
      if (params && typeof value === 'string') {
        return value.replace(/\{(\w+)\}/g, (_, k) =>
          params[k] !== undefined ? String(params[k]) : `{${k}}`
        );
      }

      return value;
    },
    [lang]
  );

  const loadNamespace = useCallback(async (namespace) => {
    const currentDict = translationsRef.current[lang] || translationsRef.current[DEFAULT_LANG];
    if (currentDict[namespace]) return; // already loaded
    try {
      const mod = await import(`@/lib/i18n/${lang}-${namespace}.json`);
      translationsRef.current[lang] = { ...translationsRef.current[lang], ...mod.default };
      // Also load for default lang if different
      if (lang !== DEFAULT_LANG) {
        const defMod = await import(`@/lib/i18n/${DEFAULT_LANG}-${namespace}.json`);
        translationsRef.current[DEFAULT_LANG] = { ...translationsRef.current[DEFAULT_LANG], ...defMod.default };
      } else {
        // Load default lang admin
        translationsRef.current[DEFAULT_LANG] = { ...translationsRef.current[DEFAULT_LANG], ...mod.default };
      }
      setDictionaryVersion((version) => version + 1);
    } catch {
      // namespace file not found
    }
  }, [lang]);

  const contextValue = useMemo(
    () => ({
      lang,
      setLang,
      t,
      mounted,
      supportedLangs: SUPPORTED_LANGS,
      loadNamespace,
      dictionaryVersion,
    }),
    [lang, setLang, t, mounted, loadNamespace, dictionaryVersion]
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
