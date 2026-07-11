'use client';


import logger from '@/lib/logger';
import { useEffect } from 'react';

const BRANDING_EVENT_NAME = 'hanimo-webui-site-branding-updated';
const THEME_EVENT_NAME = 'hanimo-webui-theme-updated';
const DEFAULT_SITE_TITLE = 'Hanimo';
const DEFAULT_SITE_DESCRIPTION = 'Self-hosted AI workspace';
const THEME_STORAGE_KEY = 'hanimo-webui-theme';

const THEME_VARS = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-ring',
];

function applySiteBranding(payload = {}) {
  const siteTitle =
    typeof payload.siteTitle === 'string' && payload.siteTitle.trim()
      ? payload.siteTitle
      : DEFAULT_SITE_TITLE;
  const siteDescription =
    typeof payload.siteDescription === 'string' && payload.siteDescription.trim()
      ? payload.siteDescription
      : DEFAULT_SITE_DESCRIPTION;
  const faviconUrl =
    typeof payload.faviconUrl === 'string' && payload.faviconUrl.trim()
      ? payload.faviconUrl
      : '/favicon.ico';

  document.title = siteTitle;

  let metaDescription = document.querySelector('meta[name="description"]');
  if (!metaDescription) {
    metaDescription = document.createElement('meta');
    metaDescription.name = 'description';
    document.head.appendChild(metaDescription);
  }
  metaDescription.content = siteDescription;

  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = faviconUrl;
}

function applyThemeColors(themeColors) {
  if (!themeColors || typeof themeColors !== 'object') {
    resetThemeColors();
    return;
  }

  const lightVars = themeColors.light;
  const darkVars = themeColors.dark;

  // :root 변수 주입 (inline style — @supports oklch보다 specificity 높음)
  if (lightVars && typeof lightVars === 'object') {
    Object.entries(lightVars).forEach(([varName, value]) => {
      if (varName.startsWith('--')) {
        document.documentElement.style.setProperty(varName, value);
      }
    });
  } else {
    resetThemeColors();
    return;
  }

  // .dark 변수 주입 (동적 style 태그 — inline style은 .dark 스코프 불가)
  let styleTag = document.getElementById('hanimo-webui-theme-dark');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'hanimo-webui-theme-dark';
    document.head.appendChild(styleTag);
  }

  if (darkVars && typeof darkVars === 'object') {
    const cssVars = Object.entries(darkVars)
      .filter(([varName]) => varName.startsWith('--'))
      .map(([varName, value]) => `  ${varName}: ${value};`)
      .join('\n');
    styleTag.textContent = `.dark {\n${cssVars}\n}`;
  }

  // localStorage 캐시 (FOUC 방지용 — Task 7에서 사용)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeColors));
  } catch (e) {
    // ignore storage errors
  }
}

function resetThemeColors() {
  // :root inline style 제거 → globals.css 기본값 복원
  THEME_VARS.forEach((varName) => {
    document.documentElement.style.removeProperty(varName);
  });

  // 동적 style 태그 제거
  const styleTag = document.getElementById('hanimo-webui-theme-dark');
  if (styleTag) {
    styleTag.remove();
  }

  // localStorage 캐시 제거
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch (e) {
    // ignore storage errors
  }
}

export default function SiteSettings() {
  useEffect(() => {
    const fetchSiteSettings = async () => {
      try {
        const response = await fetch('/api/public/settings', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (response.ok) {
          const data = await response.json();
          applySiteBranding(data);
          // 테마 적용
          if (data.themeColors && Object.keys(data.themeColors).length > 0) {
            applyThemeColors(data.themeColors);
          } else {
            resetThemeColors();
          }
        }
      } catch (error) {
        logger.error('Failed to load site settings:', error);
      }
    };

    const handleBrandingUpdated = (event) => {
      applySiteBranding(event?.detail || {});
    };

    const handleThemeUpdated = (event) => {
      const { themeColors } = event?.detail || {};
      if (themeColors && Object.keys(themeColors).length > 0) {
        applyThemeColors(themeColors);
      } else {
        resetThemeColors();
      }
    };

    fetchSiteSettings();

    window.addEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);
    window.addEventListener(THEME_EVENT_NAME, handleThemeUpdated);

    return () => {
      window.removeEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);
      window.removeEventListener(THEME_EVENT_NAME, handleThemeUpdated);
    };
  }, []);

  return null;
}
