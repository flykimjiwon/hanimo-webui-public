'use client';

import { useState, useCallback } from 'react';
import { AlertModal, ConfirmModal } from '@/components/ui/modal';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * @deprecated 이 훅은 로컬 상태로 독립적인 모달을 렌더링하므로 레이아웃에 마운트된
 * 전역 AlertModal/ConfirmModal을 사용하지 않습니다. 새 코드에서는
 * `@/contexts/AlertContext`의 `useAlert`를 사용하세요.
 * 기존 호출부(board, profile, admin/* 등)는 별도 마이그레이션 태스크로 전환 예정이며,
 * 해당 페이지에서 `{AlertComponent}` 인라인 렌더링이 제거될 때까지 이 훅을 삭제하지 마세요.
 *
 * TODO: contexts/AlertContext.js의 useAlert로 모든 호출부 마이그레이션 후 삭제
 */
export function useAlert() {
  const { t } = useTranslation();

  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info', // 'info' | 'success' | 'warning' | 'error'
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
  }, [confirmModal, closeConfirm]);

  const AlertComponent = (
    <>
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
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
      />
    </>
  );

  return {
    alert,
    confirm,
    AlertComponent,
  };
}
