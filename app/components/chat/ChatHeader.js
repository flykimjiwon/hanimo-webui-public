'use client';


import logger from '@/lib/logger';
import { useState, useEffect, memo } from 'react';

const BRANDING_EVENT_NAME = 'hanimo-webui-site-branding-updated';
const DEFAULT_SITE_DESCRIPTION = 'hanimo-webui';

const DynamicSiteTitle = memo(function DynamicSiteTitle() {
  const [siteDescription, setSiteDescription] = useState(DEFAULT_SITE_DESCRIPTION);

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
          setSiteDescription(data.siteDescription || DEFAULT_SITE_DESCRIPTION);
        }
        } catch (error) {
          logger.error('Failed to load site settings:', error);
        }
      };

    const handleBrandingUpdated = (event) => {
      setSiteDescription(
        event?.detail?.siteDescription || DEFAULT_SITE_DESCRIPTION
      );
    };

    fetchSiteSettings();

    window.addEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);

    return () => {
      window.removeEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);
    };
  }, []);

  return (
    <h1
      id='chat-header-title'
      data-testid='chat-header-title'
      className='font-bold flex items-center gap-2'
      style={{
        fontSize: 16,
        letterSpacing: '-0.015em',
        color: 'var(--hn-fg)',
      }}
    >
      <span
        aria-hidden='true'
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--hn-primary)',
          boxShadow: '0 0 0 3px var(--hn-primary-soft)',
          flexShrink: 0,
        }}
      />
      {siteDescription}
      {/* Pro 배지 — 브랜딩 목적, 항상 표시 (설정 토글은 후속 작업으로 추가 가능) */}
      <span className='inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--hn-primary-soft)] text-[var(--hn-primary-strong)] ml-2'>
        Pro
      </span>
    </h1>
  );
});

function ChatHeader() {
  return (
    <header
      id='chat-header'
      data-testid='chat-header'
      className='w-full sticky top-0 z-10 backdrop-blur-sm'
      style={{
        background: 'color-mix(in oklch, var(--hn-bg) 78%, var(--hn-surface))',
        borderBottom: '1px solid var(--hn-border)',
      }}
    >
      <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-3'>
        <div className='w-10' />
        <DynamicSiteTitle />
        <div className='w-10' />
      </div>
    </header>
  );
}

export default ChatHeader;
