'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Plus,
  Edit,
  Trash2,
  Eye,
  Calendar,
  User,
  ArrowLeft,
} from '@/components/icons';
import dynamic from 'next/dynamic';
const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-4 bg-muted rounded w-3/4" />,
});
import { useAlert } from '@/contexts/AlertContext';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

export default function NoticePage() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [userRole, setUserRole] = useState('');
  const router = useRouter();
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();

  // 사용자 권한 확인
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

  // 공지사항 목록 조회
  const fetchNotices = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/notice?page=${currentPage}&limit=10`);

      if (response.status === 401) {
        localStorage.removeItem('token');
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      if (!response.ok) {
        throw new Error(t('notice.fetch_error'));
      }

      const data = await response.json();
      setNotices(data.notices);
      setTotalPages(data.totalPages);
    } catch (error) {
      logger.error('공지사항 조회 실패:', error);
      alert(t('notice.fetch_failed'), 'error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [currentPage, router, alert, t]);

  // 공지사항 삭제
  const deleteNotice = async (id, title) => {
    const confirmed = await confirm(
      t('notice.delete_confirm', { title }),
      t('notice.delete_confirm_title')
    );
    if (!confirmed) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/notice/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      if (!response.ok) {
        throw new Error(t('notice.delete_error'));
      }

      alert(t('notice.deleted'), 'success', t('common.delete_complete'));
      fetchNotices();
    } catch (error) {
      logger.error('공지사항 삭제 실패:', error);
      alert(t('notice.delete_failed'), 'error', t('common.delete_failed'));
    }
  };

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

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

  const truncateContent = (content, maxLength = 200) => {
    // 마크다운에서 텍스트만 추출
    const textOnly = content.replace(/[#*`\[\]()]/g, '').trim();
    if (textOnly.length <= maxLength) return textOnly;
    return textOnly.substring(0, maxLength) + '...';
  };

  return (
    <div className='min-h-screen bg-background transition-colors duration-200'>
      <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto p-6'>
        {/* 헤더 */}
        <div className='flex items-start justify-between mb-8 gap-4 flex-wrap'>
          <div className='flex items-start gap-3'>
            <Button
              onClick={() => router.push('/')}
              variant='ghost'
              size='icon'
              title={t('common.go_back')}
              aria-label={t('common.go_back')}
              className='mt-1 -ml-2'
            >
              <ArrowLeft className='h-5 w-5' />
            </Button>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--hn-fg-muted)',
                  marginBottom: 8,
                }}
              >
                공지사항
              </div>
              <h1
                className='font-bold flex items-center gap-2'
                style={{
                  fontSize: 'clamp(22px, 2.6vw, 28px)',
                  letterSpacing: '-0.02em',
                  color: 'var(--hn-fg)',
                  margin: 0,
                  lineHeight: 1.25,
                }}
              >
                {t('notice.title')}
              </h1>
              <p style={{ color: 'var(--hn-fg-muted)', fontSize: 13.5, marginTop: 6, maxWidth: 560 }}>
                {t('notice.subtitle')}
              </p>
            </div>
          </div>

          {/* 관리자만 글쓰기 버튼 */}
          {userRole === 'admin' && (
            <Button
              onClick={() => router.push('/notice/write')}
            >
              <Plus className='h-4 w-4' />
              {t('common.write')}
            </Button>
          )}
        </div>

        {/* 관리자 통계 */}
        {userRole === 'admin' && (
          <div className='grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mb-4'>
            <div className='bg-card border border-border rounded-xl p-4'>
              <p className='text-xs text-muted-foreground mb-1'>{t('notice.title')} 수</p>
              <p className='text-2xl font-bold tracking-tight'>{notices.length}</p>
            </div>
          </div>
        )}

        {/* 공지사항 목록 */}
        {loading ? (
          <div className='flex items-center justify-center h-32'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
          </div>
        ) : notices.length === 0 ? (
          <EmptyState
            icon={<Bell className='h-7 w-7' />}
            title={t('notice.no_notices')}
            desc={t('notice.no_notices_desc')}
            cta={userRole === 'admin' ? t('common.write') : undefined}
            onCta={() => router.push('/notice/write')}
          />
        ) : (
          <div className='flex flex-col gap-2'>
            {notices.map((notice) => (
              <div
                key={notice._id}
                className={cn(
                  'flex items-center gap-3.5 px-[18px] py-[15px] bg-card border border-border rounded-xl hover:border-foreground/30 hover:-translate-y-px transition-all duration-[150ms]'
                )}
                style={notice.isPopup ? {
                  borderColor: 'color-mix(in oklch, var(--hn-error) 35%, transparent)',
                  backgroundColor: 'color-mix(in oklch, var(--hn-error-soft) 45%, var(--background))'
                } : {}}
              >
                {/* 아이콘 셀 */}
                <span className={cn(
                  'inline-flex items-center justify-center w-[38px] h-[38px] rounded-[10px] flex-shrink-0',
                  notice.isPopup ? 'bg-[var(--hn-error-soft)] text-[var(--hn-error)]' : 'bg-muted text-muted-foreground'
                )}>
                  <Bell className='h-4 w-4' />
                </span>

                {/* 내용 */}
                <div className='flex-1 min-w-0 mr-2'>
                  <div className='flex items-center gap-2 mb-1'>
                    <h3
                      className='text-[15px] font-semibold text-foreground cursor-pointer hover:text-primary transition-colors leading-snug'
                      onClick={() => router.push(`/notice/${notice._id}`)}
                    >
                      {notice.title}
                    </h3>
                    {notice.isPopup && (
                      <span className='inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--hn-error)] bg-[var(--hn-error-soft)] px-[9px] py-[3px] rounded-full flex-shrink-0'>
                        {t('notice.popup_badge')}
                      </span>
                    )}
                    {!notice.isActive && (
                      <Badge variant='secondary' className='flex-shrink-0'>
                        {t('notice.inactive_badge')}
                      </Badge>
                    )}
                  </div>

                  <p className='text-muted-foreground text-sm mb-2 line-clamp-2'>
                    {truncateContent(notice.content)}
                  </p>

                  <div className='flex items-center gap-4 text-xs text-muted-foreground'>
                    <div className='flex items-center gap-1'>
                      <User className='h-3 w-3' />
                      {notice.authorName}
                    </div>
                    <div className='flex items-center gap-1'>
                      <Calendar className='h-3 w-3' />
                      {formatDate(notice.createdAt)}
                    </div>
                    <div className='flex items-center gap-1'>
                      <Eye className='h-3 w-3' />
                      {notice.views}
                    </div>
                  </div>
                </div>

                {/* 관리자 액션 버튼 */}
                {userRole === 'admin' && (
                  <div className='flex items-center gap-1 flex-shrink-0'>
                    <Button
                      onClick={() => router.push(`/notice/edit/${notice._id}`)}
                      variant='ghost'
                      size='icon'
                      className='text-primary hover:bg-primary/10'
                      title={t('common.modify')}
                      aria-label={t('common.modify')}
                    >
                      <Edit className='h-4 w-4' />
                    </Button>
                    <Button
                      onClick={() => deleteNotice(notice._id, notice.title)}
                      variant='ghost'
                      size='icon'
                      className='text-destructive hover:bg-destructive/10'
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className='flex items-center justify-center space-x-2 mt-6'>
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              variant='outline'
              size='sm'
            >
              {t('common.previous')}
            </Button>

            <span className='px-4 py-2 text-sm font-medium text-muted-foreground'>
              {currentPage} / {totalPages}
            </span>

            <Button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              variant='outline'
              size='sm'
            >
              {t('common.next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
