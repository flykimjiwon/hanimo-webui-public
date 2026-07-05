'use client';

import React from 'react';
import PropTypes from 'prop-types';
import { X, Loader2 } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * 응답 생성 중에 입력 영역만 비활성화하고 중단 버튼을 표시합니다.
 * 채팅 내용은 계속 볼 수 있도록 합니다.
 * @param {{ onStop: () => void }} props
 */
export default function LoadingSpinner({ onStop }) {
  const { t } = useTranslation();
  return (
    <>
      {/* 입력 영역 오버레이 - 입력창과 버튼만 비활성화 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-sm">
        <div className="h-32" /> {/* 입력 영역 높이만큼 */}
      </div>
      
      {/* 플로팅 중단 버튼 */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-card border border-border rounded-xl shadow-sm p-3 flex items-center gap-3 shadow-lg">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
          <span className="text-muted-foreground text-sm">{t('chat.generating')}</span>
          <button
            onClick={onStop}
            className="inline-flex items-center justify-center rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1 text-xs py-1 px-2"
          >
            <X className="h-3 w-3" />
            {t('chat.stop')}
          </button>
        </div>
      </div>
    </>
  );
}

// PropTypes 로 간단히 타입 체크 (선택사항)
LoadingSpinner.propTypes = {
  onStop: PropTypes.func.isRequired,
};
