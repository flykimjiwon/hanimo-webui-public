'use client';


import logger from '@/lib/logger';
import { createContext, useContext, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/contexts/LanguageContext';

const AlertModal = dynamic(() => import('@/components/ui/modal').then(m => m.AlertModal), { ssr: false });
const ConfirmModal = dynamic(() => import('@/components/ui/modal').then(m => m.ConfirmModal), { ssr: false });

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const { t } = useLanguage();
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: null,
    confirmText: '',
    cancelText: '',
  });

  const alert = useCallback((message, type = 'info', title = null) => {
    setAlertModal({
      isOpen: true,
      title:
        title ||
        (type === 'error'
          ? t('common.error')
          : type === 'warning'
          ? t('common.warning')
          : type === 'success'
          ? t('common.success')
          : t('common.info')),
      message: String(message),
      type,
    });
  }, [t]);

  const confirm = useCallback((message, title, type = 'warning') => {
    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        title: title || t('common.confirm'),
        message: String(message),
        type,
        onConfirm: () => resolve(true),
        confirmText: t('common.confirm'),
        cancelText: t('common.cancel'),
      });
    });
  }, [t]);

  const closeAlert = useCallback(() => {
    setAlertModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false, onConfirm: null }));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (confirmModal.onConfirm) {
      await confirmModal.onConfirm();
    }
    closeConfirm();
  }, [closeConfirm, confirmModal]);

  return (
    <AlertContext.Provider value={{ alert, confirm, closeAlert, closeConfirm }}>
      {children}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={closeAlert}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText || t('common.confirm')}
        cancelText={confirmModal.cancelText || t('common.cancel')}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    // AlertProvider가 설정되어 있으므로 이 경우는 발생하지 않아야 함
    // 하지만 안전을 위해 기본 alert로 fallback
    logger.warn('useAlert는 AlertProvider 내부에서만 사용할 수 있습니다.');
    return {
      alert: (message, type, title) => window.alert(message),
      confirm: (message) => Promise.resolve(window.confirm(message)),
    };
  }
  return context;
}
