'use client';

import { useEffect, useState } from 'react';
import {
  browserStorage,
  readThemePreference,
  writeThemePreference,
} from '@/lib/theme-storage.mjs';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // 로컬스토리지에서 사용자 설정 확인
    const storage = browserStorage(window);
    const savedTheme = readThemePreference(storage);

    if (savedTheme) {
      // 로컬스토리지에 저장된 값이 있으면 사용
      const isDarkMode = savedTheme === 'dark';
      setIsDark(isDarkMode);
      applyTheme(isDarkMode);
    } else {
      // 저장된 값이 없으면 시스템 설정 따라가기
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const systemPrefersDark = mediaQuery.matches;
      setIsDark(systemPrefersDark);
      applyTheme(systemPrefersDark);

      // 시스템 설정 변경 감지
      const handleChange = (e) => {
        // 로컬스토리지에 사용자 설정이 없을 때만 시스템 설정 따라가기
        if (!readThemePreference(storage)) {
          setIsDark(e.matches);
          applyTheme(e.matches);
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const applyTheme = (isDarkMode) => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggle = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    applyTheme(newIsDark);
    writeThemePreference(browserStorage(window), newIsDark ? 'dark' : 'light');
  };

  const setTheme = (theme) => {
    const isDarkMode = theme === 'dark';
    setIsDark(isDarkMode);
    applyTheme(isDarkMode);
    writeThemePreference(browserStorage(window), theme);
  };

  return {
    isDark,
    toggle,
    setTheme,
    mounted,
  };
}
