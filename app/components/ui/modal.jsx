'use client';

import { useState, useEffect } from 'react';
import {
  AlertCircle,
  Info,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from '@/components/icons';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const iconMap = {
  info: <Info className="h-6 w-6 text-[var(--hn-info)]" />,
  warning: <AlertTriangle className="h-6 w-6 text-[var(--hn-warn)]" />,
  error: <AlertCircle className="h-6 w-6 text-[var(--hn-error)]" />,
  success: <CheckCircle className="h-6 w-6 text-[var(--hn-good)]" />,
};

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  confirmText = '확인',
}) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-0.5">{iconMap[type]}</div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="whitespace-pre-line">
                  {Array.isArray(message)
                    ? message.map((msg, index) => <div key={index}>{msg}</div>)
                    : message}
                </div>
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>{confirmText}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'warning',
  confirmText = '확인',
  cancelText = '취소',
  danger = false,
}) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    try {
      if (onConfirm) {
        await onConfirm();
      }
      onClose();
    } catch (error) {
      console.error('ConfirmModal onConfirm 실행 중 오류:', error);
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose?.(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-0.5">{iconMap[type]}</div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="whitespace-pre-line">
                  {Array.isArray(message)
                    ? message.map((msg, index) => <div key={index}>{msg}</div>)
                    : message}
                </div>
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isLoading}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              isLoading && 'pointer-events-none',
              danger && 'bg-[var(--hn-error)] text-white hover:brightness-95',
            )}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
