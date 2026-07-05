'use client';

import { useState } from 'react';
import DarkModeToggle from '@/components/DarkModeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import dynamic from 'next/dynamic';

const ThemeDrawer = dynamic(() => import('@/components/ThemeDrawer'), { ssr: false });

export default function GlobalControls() {
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <>
      <div className='fixed top-3 right-3 z-50 flex items-center gap-0.5'>
        <LanguageSwitcher />
        <DarkModeToggle />
        <button
          aria-label='테마 설정'
          title='테마 설정'
          onClick={() => setThemeOpen(true)}
          className='inline-flex items-center justify-center rounded-md transition-colors'
          style={{
            width: 36,
            height: 36,
            background: 'transparent',
            color: 'var(--hn-fg-muted, #78716c)',
            border: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hn-primary-strong, #d99437)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hn-fg-muted, #78716c)'; }}
        >
          <svg
            width='17'
            height='17'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M3 21c3-1 3-4 6-4s4 4 8 4' />
            <path d='M14 3l7 7-9 4-2-2 4-9z' />
          </svg>
        </button>
      </div>
      <ThemeDrawer open={themeOpen} onClose={() => setThemeOpen(false)} />
    </>
  );
}
