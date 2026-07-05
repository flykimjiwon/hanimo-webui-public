'use client';


import logger from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Calendar, User, Eye, Edit, Bell } from '@/components/icons';
import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-4 bg-muted rounded w-3/4" />,
});
import { useAlert } from '@/contexts/AlertContext';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';

export default function NoticeDetailPage() {
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const router = useRouter();
  const params = useParams();
  const { id } = params;
  const { alert } = useAlert();
  const { t } = useTranslation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }

    try {
      const payload = decodeJWTPayload(token);
      setUserRole(payload.role || 'user');
    } catch (error) {
      logger.error('토큰 파싱 실패:', error);
      localStorage.removeItem('token');
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
    }
  }, [router]);

  useEffect(() => {
    const fetchNotice = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/notice/${id}`);

        if (response.status === 404) {
          alert(t('notice.not_found_msg'), 'error', t('common.error'));
          router.push('/notice');
          return;
        }

        if (!response.ok) {
          throw new Error(t('notice.fetch_error'));
        }

        const data = await response.json();
        setNotice(data.notice);
      } catch (error) {
        logger.error('공지사항 조회 실패:', error);
        alert(t('notice.fetch_failed'), 'error', t('common.error'));
        router.push('/notice');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchNotice();
    }
  }, [id, router, alert, t]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul',
    });
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <Spinner size={28} label={t('common.loading')} />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <EmptyState
          icon={<Bell className='h-7 w-7' />}
          title={t('notice.not_found')}
          desc={t('notice.not_found_msg')}
          cta={t('common.back_to_list_full')}
          onCta={() => router.push('/notice')}
        />
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background transition-colors duration-200'>
      <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto p-6'>
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-4'>
            <Button
              onClick={() => router.push('/notice')}
              variant='ghost'
              size='icon'
              title={t('common.back_to_list')}
              aria-label={t('common.back_to_list')}
            >
              <ArrowLeft className='h-5 w-5' />
            </Button>
            <h1 className='text-2xl font-bold text-foreground'>
              {t('notice.title')}
            </h1>
          </div>

          {userRole === 'admin' && (
            <Button
              onClick={() => router.push(`/notice/edit/${id}`)}
              variant='ghost'
              aria-label={t('common.modify')}
            >
              <Edit className='h-4 w-4' />
              {t('common.modify')}
            </Button>
          )}
        </div>

        <Card className='overflow-hidden'>
          <CardContent className='p-0'>
            <div className='p-6 border-b border-border'>
              {notice.isPopup && (
                <span className='inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--hn-error)] bg-[var(--hn-error-soft)] px-[9px] py-[3px] rounded-full mb-2.5'>
                  <Bell className='h-3 w-3' /> {t('notice.popup_badge')}
                </span>
              )}
              <div className='flex items-center gap-2 mb-4'>
                <h1
                  style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 }}
                  className='text-foreground'
                >
                  {notice.title}
                </h1>
                {!notice.isActive && (
                  <Badge variant='secondary'>
                    {t('notice.inactive_badge')}
                  </Badge>
                )}
              </div>

              <div className='flex items-center gap-6 text-sm text-muted-foreground'>
                <div className='flex items-center gap-2'>
                  <User className='h-4 w-4' />
                  <span>{notice.authorName}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Calendar className='h-4 w-4' />
                  <span>{formatDate(notice.createdAt)}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Eye className='h-4 w-4' />
                  <span>{t('notice.views_count', { count: notice.views })}</span>
                </div>
                {notice.updatedAt && notice.updatedAt !== notice.createdAt && (
                  <div className='text-xs'>
                    {t('notice.updated_at', { date: formatDate(notice.updatedAt) })}
                  </div>
                )}
              </div>
            </div>

            <div className='p-6 pt-0'>
              <div className='prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed'>
                <MarkdownPreview
                  source={notice.content}
                  style={{
                    backgroundColor: 'transparent',
                    color: 'inherit',
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className='flex justify-center mt-6'>
          <Button
            onClick={() => router.push('/notice')}
            variant='outline'
          >
            {t('common.back_to_list')}
          </Button>
        </div>
      </div>
    </div>
  );
}
