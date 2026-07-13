'use client';


import logger from '@/lib/logger';
import { useState, useEffect } from 'react';
import { X, Eye, Bell } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';

const getHideSettingsKey = (target) => `noticeHideSettings:${target}`;

const getHideSettings = (target) => {
  const settings = localStorage.getItem(getHideSettingsKey(target));
  return settings ? JSON.parse(settings) : { permanent: [], oneDay: {} };
};

const saveHideSettings = (target, settings) => {
  localStorage.setItem(getHideSettingsKey(target), JSON.stringify(settings));
};

export default function NoticePopup({ target = 'main', initialNotice = null }) {
  const [notice, setNotice] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const { t, lang } = useTranslation();

  // 모달이 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isVisible]);

  // 초기 공지 주입 (로그인 페이지 등에서 사용)
  useEffect(() => {
    if (!initialNotice) return;

    // 안보기 설정 확인
    const hideSettings = getHideSettings(target);
    const noticeId = initialNotice._id;

    // 영구 안보기 체크
    if (hideSettings.permanent.includes(noticeId)) {
      setLoading(false);
      return;
    }

    // 하루 안보기 체크
    const oneDayHide = hideSettings.oneDay[noticeId];
    if (oneDayHide && new Date(oneDayHide) > new Date()) {
      setLoading(false);
      return;
    }

    setNotice(initialNotice);
    setIsVisible(true);
    setLoading(false);
  }, [initialNotice, target]);

  // 팝업 공지사항 조회
  useEffect(() => {
    if (initialNotice) return;
    const fetchPopupNotice = async () => {
      try {
        const response = await fetch(
          `/api/notice?showPopup=true&limit=1&popupTarget=${target}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.notices && data.notices.length > 0) {
            const latestNotice = data.notices[0];

            // 안보기 설정 확인
            const hideSettings = getHideSettings(target);
            const noticeId = latestNotice._id;

            // 영구 안보기 체크
            if (hideSettings.permanent.includes(noticeId)) {
              setLoading(false);
              return;
            }

            // 하루 안보기 체크
            const oneDayHide = hideSettings.oneDay[noticeId];
            if (oneDayHide && new Date(oneDayHide) > new Date()) {
              setLoading(false);
              return;
            }

            setNotice(latestNotice);
            setIsVisible(true);
          }
        }
      } catch (error) {
        logger.error('팝업 공지사항 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    // 메인/로그인 모두 설정 조건만 충족하면 표시
    fetchPopupNotice();
  }, [initialNotice, target]);

  // 하루 안보기
  const hideForOneDay = () => {
    const settings = getHideSettings(target);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // 다음날 자정까지

    settings.oneDay[notice._id] = tomorrow.toISOString();
    saveHideSettings(target, settings);
    setIsVisible(false);
  };

  // 계속 안보기
  const hidePermanently = () => {
    const settings = getHideSettings(target);
    if (!settings.permanent.includes(notice._id)) {
      settings.permanent.push(notice._id);
    }
    saveHideSettings(target, settings);
    setIsVisible(false);
  };

  // 팝업 닫기
  const closePopup = () => {
    setIsVisible(false);
  };

  // 상세보기로 이동
  const goToDetail = () => {
    window.open(`/notice/${notice._id}`, '_blank');
    setIsVisible(false);
  };

  // 내용 자르기 (50-200자)
  const truncateContent = (content, minLength = 50, maxLength = 200) => {
    // 마크다운에서 텍스트만 추출
    const textOnly = content.replace(/[#*`\[\]()!]/g, '').trim();

    if (textOnly.length <= minLength) {
      return textOnly;
    }

    if (textOnly.length <= maxLength) {
      return textOnly;
    }

    // maxLength에서 단어 경계까지 자르기
    let truncated = textOnly.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > minLength) {
      truncated = truncated.substring(0, lastSpace);
    }

    return truncated + '...';
  };

  const formatDate = (dateString) => {
    const locale = lang === 'en' ? 'en-US' : 'ko-KR';
    return new Date(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    });
  };

  // 로딩 중이거나 공지사항이 없거나 표시 안함 상태
  if (loading || !notice || !isVisible) {
    return null;
  }

  // 동적 사이즈 스타일 계산
  const modalStyle = {
    maxWidth: notice.popupWidth ? `${notice.popupWidth}px` : '512px',
    maxHeight: notice.popupHeight ? `${notice.popupHeight}px` : '80vh',
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      {/* 배경 오버레이 */}
      <div
        className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
        onClick={closePopup}
      />

      {/* 모달 */}
      <div
        className='relative bg-card rounded-xl shadow-2xl w-full overflow-hidden transform transition-all duration-300 scale-100'
        style={modalStyle}
      >
        {/* 헤더 */}
        <div className='flex items-center justify-between p-4 border-b border-border bg-primary/10'>
          <div className='flex items-center gap-2'>
            <Bell className='h-5 w-5 text-primary' />
            <h3 className='text-lg font-semibold text-foreground'>
              {t('notice.title')}
            </h3>
          </div>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={closePopup}
            title={t('notice.close')}
          >
            <X className='h-5 w-5' />
          </Button>
        </div>

        {/* 내용 */}
        <div className='p-6 overflow-y-auto max-h-[50vh]'>
          {/* 제목 */}
          <h4 className='text-xl font-bold text-foreground mb-2'>
            {notice.title}
          </h4>

          {/* 메타 정보 */}
          <div className='text-sm text-muted-foreground mb-4'>
            {notice.authorName} • {formatDate(notice.createdAt)}
          </div>

          {/* 내용 미리보기 */}
          <div className='text-foreground text-sm leading-relaxed whitespace-pre-line'>
            {truncateContent(notice.content)}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className='p-6 border-t border-border bg-muted'>
          <div className='flex items-center justify-between flex-wrap gap-3'>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='xs'
                onClick={hideForOneDay}
              >
                {t('notice.hide_one_day')}
              </Button>
              <Button
                variant='outline'
                size='xs'
                onClick={hidePermanently}
              >
                {t('notice.hide_permanently')}
              </Button>
            </div>

            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={closePopup}
              >
                {t('notice.close')}
              </Button>
              <Button
                size='sm'
                onClick={goToDetail}
              >
                <Eye className='h-4 w-4' />
                {t('notice.detail')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
