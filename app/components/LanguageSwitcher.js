'use client';

import { Globe } from '@/components/icons';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

const LANGUAGE_LABELS = {
  ko: '한국어',
  en: 'English',
};

export default function LanguageSwitcher() {
  const { lang, setLang, mounted } = useLanguage();

  if (!mounted) {
    return (
      <Button variant='ghost' size='icon-sm' className='text-muted-foreground' disabled>
        <Globe className='h-4 w-4' />
      </Button>
    );
  }

  const nextLang = lang === 'ko' ? 'en' : 'ko';

  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={() => setLang(nextLang)}
      title={`${LANGUAGE_LABELS[lang]} → ${LANGUAGE_LABELS[nextLang]}`}
      aria-label={`Switch from ${LANGUAGE_LABELS[lang]} to ${LANGUAGE_LABELS[nextLang]}`}
      className='gap-1.5 px-2 text-muted-foreground hover:text-foreground'
    >
      <Globe className='h-4 w-4' />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          fontFamily: 'var(--hn-mono)',
        }}
      >
        {lang.toUpperCase()}
      </span>
    </Button>
  );
}
