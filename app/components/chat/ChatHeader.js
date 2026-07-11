'use client';


import logger from '@/lib/logger';
import { useState, useEffect, memo } from 'react';
import HanimoMark from '@/components/brand/HanimoMark';

const BRANDING_EVENT_NAME = 'hanimo-webui-site-branding-updated';
const DEFAULT_SITE_TITLE = 'Hanimo';
const DEFAULT_SITE_DESCRIPTION = 'Self-hosted AI workspace';

const DynamicSiteTitle = memo(function DynamicSiteTitle() {
  const [branding, setBranding] = useState({
    siteTitle: DEFAULT_SITE_TITLE,
    siteDescription: DEFAULT_SITE_DESCRIPTION,
  });

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
          setBranding({
            siteTitle: data.siteTitle || DEFAULT_SITE_TITLE,
            siteDescription: data.siteDescription || DEFAULT_SITE_DESCRIPTION,
          });
        }
        } catch (error) {
          logger.error('Failed to load site settings:', error);
        }
      };

    const handleBrandingUpdated = (event) => {
      setBranding({
        siteTitle: event?.detail?.siteTitle || DEFAULT_SITE_TITLE,
        siteDescription:
          event?.detail?.siteDescription || DEFAULT_SITE_DESCRIPTION,
      });
    };

    fetchSiteSettings();

    window.addEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);

    return () => {
      window.removeEventListener(BRANDING_EVENT_NAME, handleBrandingUpdated);
    };
  }, []);

  return (
    <div
      id='chat-header-title'
      data-testid='chat-header-title'
      className='flex min-w-0 items-center gap-2.5'
    >
      <HanimoMark size={27} />
      <div className='min-w-0 text-left'>
        <h1 className='m-0 truncate text-[14px] font-semibold tracking-[-0.015em] text-[var(--hn-fg)] sm:text-[15px]'>
          {branding.siteTitle}
        </h1>
        <p className='m-0 hidden max-w-[360px] truncate text-[10px] font-medium text-[var(--hn-fg-muted)] sm:block'>
          {branding.siteDescription}
        </p>
      </div>
    </div>
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
      <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto flex items-center justify-center gap-4 px-14 py-2.5 sm:px-4'>
        <div className='w-10' />
        <DynamicSiteTitle />
        <div className='w-10' />
      </div>
    </header>
  );
}

export default ChatHeader;
