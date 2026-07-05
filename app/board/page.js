'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  ArrowLeft,
  Search,
  Eye,
} from '@/components/icons';
import { Pin } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAlert } from '@/contexts/AlertContext';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/useTranslation';

export default function BoardPage() {
  const router = useRouter();
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [userRole, setUserRole] = useState('user');
  const [userId, setUserId] = useState('');
  const [boardEnabled, setBoardEnabled] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // category는 UI 전용 탭 필터(API는 isNotice bool만 제공) — TODO: API에 category 컬럼 추가 시 서버 필터로 전환
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    try {
      const payload = decodeJWTPayload(token);
      setUserRole(payload.role || 'user');
      setUserId(payload.sub || '');
    } catch (error) {
      logger.error('토큰 파싱 실패:', error);
      localStorage.removeItem('token');
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
    }
  }, [router]);

  const fetchBoardEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) return;
      const data = await res.json();
      setBoardEnabled(
        data.boardEnabled !== undefined ? data.boardEnabled : true
      );
    } catch (error) {
      logger.warn('자유게시판 설정 조회 실패:', error);
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      const response = await fetch(
        `/api/board/posts?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem('token');
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.fetch_error'));
      }

      const data = await response.json();
      setPosts(data.posts || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      logger.error('자유게시판 조회 실패:', error);
      alert(t('board.fetch_failed'), 'error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [alert, currentPage, router, searchTerm, t]);

  useEffect(() => {
    fetchBoardEnabled();
  }, [fetchBoardEnabled]);

  useEffect(() => {
    if (boardEnabled) {
      fetchPosts();
    } else {
      setLoading(false);
    }
  }, [boardEnabled, fetchPosts]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // post의 표시 카테고리: API는 isNotice bool만 제공 → notice 매핑, 나머지는 post.category(없으면 'general')
  const getPostCategory = (post) =>
    post.isNotice ? 'notice' : post.category || 'general';

  // 카테고리 태그 스타일(시맨틱 소프트 토큰). general은 배지 없음(null 반환).
  const categoryTagStyle = {
    notice: { bg: 'var(--hn-warn-soft)', fg: 'var(--hn-warn)', label: t('common.notice_badge') },
    doc: { bg: 'var(--hn-surface-3)', fg: 'var(--hn-fg-muted)', label: '문서' },
    ask: { bg: 'var(--hn-info-soft)', fg: 'var(--hn-info)', label: '질문' },
    share: { bg: 'var(--hn-good-soft)', fg: 'var(--hn-good)', label: '공유' },
  };

  // 탭별 클라이언트 필터. 공지=isNotice, 나머지=post.category(API 확장 전까지 비어 있음)
  const tabFilter = (post) => {
    const cat = getPostCategory(post);
    if (activeTab === 'all') return true;
    return cat === activeTab;
  };
  const visiblePosts = posts.filter(tabFilter);

  const tabs = [
    { key: 'all', label: '전체', count: posts.length },
    { key: 'notice', label: '공지', count: posts.filter((p) => getPostCategory(p) === 'notice').length },
    { key: 'doc', label: '문서', count: posts.filter((p) => getPostCategory(p) === 'doc').length },
    { key: 'ask', label: '질문', count: posts.filter((p) => getPostCategory(p) === 'ask').length },
    { key: 'share', label: '공유', count: posts.filter((p) => getPostCategory(p) === 'share').length },
  ];

  const canManagePost = (post) => {
    if (!post?.userId) return false;
    return userRole === 'admin' || post.userId === userId;
  };

  const deletePost = async (post) => {
    const confirmed = await confirm(
      t('board.delete_post_confirm', { title: post.title }),
      t('board.delete_post_confirm_title')
    );
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/board/posts/${post.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.post_delete_error'));
      }

      alert(t('board.post_deleted'), 'success', t('common.delete_complete'));
      fetchPosts();
    } catch (error) {
      logger.error('게시글 삭제 실패:', error);
      alert(t('board.post_delete_failed'), 'error', t('common.delete_failed'));
    }
  };

  if (!boardEnabled) {
    return (
      <div className='min-h-screen' style={{ background: 'var(--hn-bg)', color: 'var(--hn-fg)' }}>
        <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto p-6'>
          <div className='flex items-center gap-4 mb-6'>
            <Button
              onClick={() => router.push('/')}
              variant='ghost'
              size='icon'
              title={t('common.go_back')}
            >
              <ArrowLeft className='h-5 w-5' />
            </Button>
            <h1 className='text-2xl font-bold text-foreground'>
              {t('board.title')}
            </h1>
          </div>
          <Card>
            <CardContent className='p-8 text-center'>
              <MessageSquare className='mx-auto h-12 w-12 text-muted-foreground' />
              <p className='mt-4 text-sm text-muted-foreground'>
                {t('board.disabled')}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen transition-colors duration-200' style={{ background: 'var(--hn-bg)', color: 'var(--hn-fg)' }}>
      <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto p-6'>
        {/* eyebrow + 큰 타이틀 hero (시안 BoardScreen 톤) */}
        <div className='flex items-start justify-between mb-8 gap-4 flex-wrap'>
          <div className='flex items-start gap-3'>
            <Button
              onClick={() => router.push('/')}
              variant='ghost'
              size='icon'
              title={t('common.go_back')}
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
                {t('board.eyebrow')}
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
                {t('board.title')}
              </h1>
              <p style={{ color: 'var(--hn-fg-muted)', fontSize: 13.5, marginTop: 6, maxWidth: 560 }}>
                {t('board.subtitle')}
              </p>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-3'>
            <Button onClick={() => router.push('/board/write')}>
              <Plus className='h-4 w-4' />
              {t('common.write')}
            </Button>
          </div>
        </div>

        {/* 카테고리 탭 바 + 인라인 검색 (시안 BoardScreen 톤) */}
        <div className='flex items-center justify-between gap-4 flex-wrap mb-4 border-b border-border'>
          <div className='flex items-center gap-1 -mb-px'>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type='button'
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-sm border-b-2 transition-colors ${
                    active
                      ? 'border-primary text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  <span className='text-xs text-muted-foreground ml-1'>{tab.count}</span>
                </button>
              );
            })}
          </div>
          <div className='relative pb-2'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              type='text'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('board.search_placeholder')}
              className='pl-9'
              style={{ minWidth: 200 }}
            />
          </div>
        </div>

        <Card
          className='overflow-hidden'
          style={{
            background: 'var(--hn-surface)',
            border: '1px solid var(--hn-border)',
            borderRadius: 14,
            boxShadow: 'var(--hn-shadow-sm)',
          }}
        >
          <CardContent className='p-0'>
            {loading ? (
              <div className='flex items-center justify-center h-32'>
                <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
              </div>
            ) : visiblePosts.length === 0 ? (
              activeTab !== 'all' ? (
                <EmptyState
                  icon={<MessageSquare className='h-7 w-7' />}
                  title='이 분류에는 게시글이 없습니다'
                  desc='다른 탭을 선택하거나 새 글을 작성해보세요.'
                />
              ) : (
                <div className='text-center py-12'>
                  <MessageSquare className='mx-auto h-12 w-12 text-muted-foreground' />
                  <h3 className='mt-2 text-sm font-medium text-foreground'>
                    {t('board.no_posts')}
                  </h3>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {searchTerm ? t('board.no_search_results') : t('board.first_post_hint')}
                  </p>
                </div>
              )
            ) : (
              <div style={{ borderColor: 'var(--hn-border)' }} className='divide-y divide-border'>
                {visiblePosts.map((post) => {
                  const cat = getPostCategory(post);
                  const tag = categoryTagStyle[cat];
                  return (
                  <div
                    key={post.id}
                    className='p-6 transition-all cursor-pointer relative'
                    style={{
                      borderLeft: '3px solid transparent',
                      // isNotice = 시안의 pinned 대응 — 핀 고정 행은 primary-soft 배경
                      background: post.isNotice ? 'var(--hn-primary-soft)' : undefined,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--hn-surface-2)';
                      e.currentTarget.style.borderLeftColor = 'var(--hn-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = post.isNotice ? 'var(--hn-primary-soft)' : '';
                      e.currentTarget.style.borderLeftColor = 'transparent';
                    }}
                    onClick={() => router.push(`/board/${post.id}`)}
                  >
                    <div className='flex items-start justify-between'>
                      <div className='flex-1 min-w-0 mr-4'>
                        <div className='flex items-center gap-2 mb-2'>
                          {post.isNotice && (
                            <Pin className='h-3 w-3 text-primary shrink-0' aria-hidden />
                          )}
                          {tag && (
                            <span
                              className='text-xs font-medium px-2 py-0.5 rounded-full shrink-0'
                              style={{ background: tag.bg, color: tag.fg }}
                            >
                              {tag.label}
                            </span>
                          )}
                          <h3
                            className='text-lg font-semibold text-foreground hover:text-primary transition-colors'
                          >
                            {post.title}
                          </h3>
                          {post.commentCount > 0 && (
                            <span className='text-xs text-muted-foreground'>
                              {t('board.comment_count', { count: post.commentCount })}
                            </span>
                          )}
                        </div>

                        <div className='flex flex-wrap items-center gap-4 text-xs text-muted-foreground'>
                          <span>{post.author?.name || t('common.anonymous')}</span>
                          {post.author?.department && (
                      <span>{post.author.department.replaceAll('부서', '그룹')}</span>
                          )}
                          <span>{formatDate(post.createdAt)}</span>
                          <span className='flex items-center gap-1'>
                            <Eye className='h-3 w-3' />
                            {post.views ?? 0}
                          </span>
                        </div>
                      </div>

                      {canManagePost(post) && (
                        <div className='flex items-center gap-2'>
                          <Button
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/board/edit/${post.id}`);
                            }}
                            variant='ghost'
                            size='icon'
                            className='text-primary bg-primary/10 hover:bg-primary/20'
                            title={t('board.edit_post')}
                          >
                            <Edit className='h-4 w-4' />
                          </Button>
                          <Button
                            onClick={(event) => {
                              event.stopPropagation();
                              deletePost(post);
                            }}
                            variant='ghost'
                            size='icon'
                            className='text-destructive bg-destructive/10 hover:bg-destructive/20'
                            title={t('board.delete_post')}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className='flex items-center justify-center gap-2 mt-6'>
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              variant='outline'
              size='sm'
            >
              {t('common.previous')}
            </Button>
            <span className='text-sm text-muted-foreground'>
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
