'use client';


import logger from '@/lib/logger';
import { useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Error({ error, reset }) {
  const { t } = useLanguage();
  useEffect(() => {
    logger.error('Error:', error);
  }, [error]);

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-background'>
      <div className='text-center'>
        <h1 className='text-9xl font-bold text-muted-foreground/30'>
          {t('errors.title')}
        </h1>
        <h2 className='mt-4 text-3xl font-semibold text-foreground'>
          {t('errors.something_went_wrong')}
        </h2>
        <p className='mt-4 text-muted-foreground'>
          {t('errors.page_load_error')}
        </p>
        <div className='mt-8 space-x-4'>
          <button
            onClick={() => reset()}
            className='inline-flex items-center rounded-lg bg-neutral-900 dark:bg-neutral-100 px-6 py-3 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors'
          >
            {t('common.retry')}
          </button>
          <Link
            href='/'
            className='inline-flex items-center rounded-lg bg-muted px-6 py-3 text-foreground hover:bg-accent transition-colors'
          >
            {t('common.go_home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
