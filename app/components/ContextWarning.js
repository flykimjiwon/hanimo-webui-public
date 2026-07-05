'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertModal } from './ui/modal';
import { useTranslation } from '@/hooks/useTranslation';

export default function ContextWarning({ warning, onDismiss }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      onDismiss();
    }, 300);
  }, [onDismiss]);

  useEffect(() => {
    if (warning) {
      setIsOpen(true);
      // 5초 후 자동 사라짐
      const timer = setTimeout(() => {
        handleClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [warning, handleClose]);

  if (!warning) return null;

  return (
    <AlertModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('chat.context_warning_title')}
      message={warning}
      type="warning"
    />
  );
}