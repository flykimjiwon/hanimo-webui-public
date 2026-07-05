'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export default function TypingAnimation({ baseText }) {
  const { t } = useTranslation();
  const displayText = baseText ?? t('chat.preparing_answer');
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center w-full text-foreground">
      <div className="mr-2 w-4 h-4 bg-primary rounded-full animate-pulse"></div>
      <span>{displayText}{dots}</span>
    </div>
  );
}
