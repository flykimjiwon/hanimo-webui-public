'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

// 빌드 시점 prerender 방지
export const dynamic = 'force-dynamic';

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-background'>
      <div className='text-center'>
        <h1 className='text-9xl font-bold text-muted-foreground/30'>
          {t('errors.not_found_title')}
        </h1>
        <h2 className='mt-4 text-3xl font-semibold text-foreground'>
          {t('errors.not_found_message')}
        </h2>
        <p className='mt-4 text-muted-foreground'>
          {t('errors.not_found_description')}
        </p>
        <div className='mt-8'>
          <Link
            href='/'
            className='inline-flex items-center rounded-lg bg-neutral-900 dark:bg-neutral-100 px-6 py-3 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors'
          >
            {t('common.go_home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
