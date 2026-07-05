'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Edit, Trash2, Send, Eye } from '@/components/icons';
import { Heart, MessageSquare, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-4 bg-muted rounded w-3/4" />,
});
import { useAlert } from '@/contexts/AlertContext';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

// 댓글 좋아요 — 로컬 UI 상태만(좋아요 API 없음). TODO: 댓글 좋아요 API 추가 시 연동
function CommentLikeButton() {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  return (
    <button
      type='button'
      onClick={() => {
        setLiked((prev) => {
          setCount((c) => (prev ? c - 1 : c + 1));
          return !prev;
        });
      }}
      aria-pressed={liked}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        liked ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />
      {count > 0 ? count : '좋아요'}
    </button>
  );
}

export default function BoardDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('user');
  const [userId, setUserId] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [boardEnabled, setBoardEnabled] = useState(true);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  // 좋아요는 로컬 UI 상태만 — 좋아요 API 없음(영속 안 함). TODO: /api/board/posts/:id/like 추가 시 연동
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

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

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setBoardEnabled(
          data.boardEnabled !== undefined ? data.boardEnabled : true
        );
      })
      .catch(() => {});
  }, []);

  const fetchPost = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/board/posts/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.post_fetch_error'));
      }

      const data = await response.json();
      setPost(data.post);
      setComments(data.comments || []);
    } catch (error) {
      logger.error('게시글 조회 실패:', error);
      alert(t('board.post_fetch_failed'), 'error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [alert, params.id, router, t]);

  useEffect(() => {
    if (boardEnabled) {
      fetchPost();
    } else {
      setLoading(false);
    }
  }, [boardEnabled, fetchPost]);

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

  // 본문 마크다운에서 ##/### 헤딩을 파싱해 side TOC 생성(best-effort 앵커 점프)
  const toc = useMemo(() => {
    if (!post?.content) return [];
    const slugify = (text) =>
      text
        .trim()
        .toLowerCase()
        .replace(/[^\w\s가-힣-]/g, '')
        .replace(/\s+/g, '-');
    const items = [];
    const re = /^(#{2,3})\s+(.+)$/gm;
    let m;
    while ((m = re.exec(post.content)) !== null) {
      const text = m[2].trim();
      items.push({ level: m[1].length, text, slug: slugify(text) });
    }
    return items;
  }, [post?.content]);

  const canManagePost = post && (userRole === 'admin' || post.userId === userId);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('링크가 복사되었습니다');
    } catch {
      toast.error('링크 복사에 실패했습니다');
    }
  };

  const deletePost = async () => {
    if (!post) return;
    const confirmed = await confirm(
      t('board.delete_post_confirm', { title: post.title }),
      t('board.delete_post_confirm_title')
    );
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/board/posts/${post.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.post_delete_error'));
      }

      alert(t('board.post_deleted'), 'success', t('common.delete_complete'));
      router.push('/board');
    } catch (error) {
      logger.error('게시글 삭제 실패:', error);
      alert(t('board.post_delete_failed'), 'error', t('common.delete_failed'));
    }
  };

  const submitComment = async () => {
    if (!commentInput.trim()) {
      alert(t('board.comment_empty'), 'warning', t('common.input_required'));
      return;
    }

    try {
      setSavingComment(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/board/comments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: post.id,
          content: commentInput.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.comment_submit_error'));
      }

      setCommentInput('');
      fetchPost();
    } catch (error) {
      logger.error('댓글 등록 실패:', error);
      alert(t('board.comment_submit_failed'), 'error', t('common.error'));
    } finally {
      setSavingComment(false);
    }
  };

  const deleteComment = async (comment) => {
    const confirmed = await confirm(t('board.comment_delete_confirm'), t('board.comment_delete_title'));
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/board/comments/${comment.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.comment_delete_error'));
      }
      fetchPost();
    } catch (error) {
      logger.error('댓글 삭제 실패:', error);
      alert(t('board.comment_delete_failed'), 'error', t('common.error'));
    }
  };

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.content);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  const saveEditComment = async (comment) => {
    if (!editingCommentText.trim()) {
      alert(t('board.comment_empty'), 'warning', t('common.input_required'));
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/board/comments/${comment.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: editingCommentText.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.comment_edit_error'));
      }

      cancelEditComment();
      fetchPost();
    } catch (error) {
      logger.error('댓글 수정 실패:', error);
      alert(t('board.comment_edit_failed'), 'error', t('common.error'));
    }
  };

  if (!boardEnabled) {
    return (
      <div className='min-h-screen' style={{ background: 'var(--hn-bg)', color: 'var(--hn-fg)' }}>
        <div className='w-full max-w-4xl mx-auto p-6'>
          <div className='flex items-center gap-4 mb-6'>
            <Button
              onClick={() => router.push('/board')}
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
            <CardContent className='p-6 text-center text-sm text-muted-foreground'>
              {t('board.disabled')}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen' style={{ background: 'var(--hn-bg)', color: 'var(--hn-fg)' }}>
      <div className='w-full max-w-5xl mx-auto p-6 space-y-6'>
        <div className='flex items-center justify-between'>
          <Button
            onClick={() => router.push('/board')}
            variant='ghost'
          >
            <ArrowLeft className='h-5 w-5' />
            {t('common.back_to_list')}
          </Button>
          {canManagePost && (
            <div className='flex items-center gap-2'>
              <Button
                onClick={() => router.push(`/board/edit/${post.id}`)}
                variant='secondary'
                size='sm'
              >
                <Edit className='h-4 w-4' />
                {t('common.modify')}
              </Button>
              <Button
                onClick={deletePost}
                variant='destructive'
                size='sm'
              >
                <Trash2 className='h-4 w-4' />
                {t('common.delete')}
              </Button>
            </div>
          )}
        </div>

        <div className='flex gap-9 items-start'>
          <Card className='flex-1 min-w-0'>
            <CardContent className='p-6'>
              {loading || !post ? (
                <div className='flex items-center justify-center h-32'>
                  <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
                </div>
              ) : (
                <>
                  <div className='flex items-center gap-2 mb-2'>
                    {post.isNotice && (
                      <span
                        className='text-xs font-medium px-2 py-0.5 rounded-full shrink-0'
                        style={{ background: 'var(--hn-warn-soft)', color: 'var(--hn-warn)' }}
                      >
                        {t('common.notice_badge')}
                      </span>
                    )}
                    <h1 className='text-2xl font-bold text-foreground'>
                      {post.title}
                    </h1>
                  </div>
                  <div className='text-xs text-muted-foreground mb-4 flex flex-wrap gap-3'>
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
                  <div className='board-prose markdown-content text-foreground'>
                    <MarkdownPreview
                      source={post.content}
                      className='text-foreground'
                      style={{ padding: 0, backgroundColor: 'transparent', color: 'inherit' }}
                    />
                  </div>

                  {/* 리액션/액션 푸터 — 좋아요(로컬), 댓글 수(실데이터), 링크 복사 */}
                  <div className='flex items-center gap-2 mt-6 pt-4 border-t border-border'>
                    <button
                      type='button'
                      onClick={() => {
                        setLiked((prev) => {
                          setLikeCount((c) => (prev ? c - 1 : c + 1));
                          return !prev;
                        });
                      }}
                      aria-pressed={liked}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                        liked
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                      {likeCount}
                    </button>
                    <button
                      type='button'
                      onClick={() => {
                        const el = document.getElementById('board-comments');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-muted-foreground hover:bg-muted transition-colors'
                    >
                      <MessageSquare className='h-4 w-4' />
                      {comments.length}
                    </button>
                    <div className='flex-1' />
                    <button
                      type='button'
                      onClick={copyLink}
                      aria-label='링크 복사'
                      className='inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:bg-muted transition-colors'
                    >
                      <LinkIcon className='h-4 w-4' />
                    </button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* side TOC — lg 이상에서만, 헤딩 없으면 렌더 안 함 */}
          {!loading && post && toc.length > 0 && (
            <aside className='w-52 shrink-0 sticky top-6 hidden lg:block'>
              <nav className='text-sm space-y-1'>
                {toc.map((item, i) => (
                  <a
                    key={`${item.slug}-${i}`}
                    href={`#${item.slug}`}
                    className='block py-1 pl-3 border-l-2 border-transparent text-muted-foreground hover:text-primary hover:border-primary transition-colors'
                    style={{ paddingLeft: item.level === 3 ? 24 : 12 }}
                  >
                    {item.text}
                  </a>
                ))}
              </nav>
              {post.author?.name && (
                <>
                  <hr className='my-4 border-border' />
                  <div className='text-sm'>
                    <div className='font-medium text-foreground'>{post.author.name}</div>
                    {post.author?.department && (
                      <div className='text-xs text-muted-foreground mt-0.5'>
                        {post.author.department.replaceAll('부서', '그룹')}
                      </div>
                    )}
                    <div className='text-xs text-muted-foreground mt-0.5'>
                      {formatDate(post.createdAt)}
                    </div>
                  </div>
                </>
              )}
            </aside>
          )}
        </div>

        <Card id='board-comments' className='max-w-4xl'>
          <CardContent className='p-6 space-y-4'>
            <h2 className='text-lg font-semibold text-foreground'>
              {t('board.comments_title', { count: comments.length })}
            </h2>

            <div className='space-y-4'>
              {comments.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('board.no_comments')}
                </p>
              ) : (
                comments.map((comment) => {
                  const canDelete =
                    userRole === 'admin' || comment.userId === userId;
                  const isOp = post && comment.userId === post.userId;
                  const initial = (comment.author?.name || '?').charAt(0).toUpperCase();
                  return (
                    <div key={comment.id} className='flex gap-3'>
                      <div className='w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0'>
                        {initial}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2 flex-wrap'>
                            <span className='font-medium text-sm text-foreground'>
                              {comment.author?.name || t('common.anonymous')}
                            </span>
                            {isOp && (
                              <span className='text-xs bg-primary/10 text-primary px-1.5 rounded'>
                                작성자
                              </span>
                            )}
                            <span className='text-xs text-muted-foreground'>
                              {formatDate(comment.createdAt)}
                            </span>
                          </div>
                          {canDelete && (
                            <div className='flex items-center gap-2 text-xs'>
                              <Button
                                onClick={() => startEditComment(comment)}
                                variant='link'
                                size='xs'
                                className='text-primary'
                              >
                                {t('common.modify')}
                              </Button>
                              <Button
                                onClick={() => deleteComment(comment)}
                                variant='link'
                                size='xs'
                                className='text-destructive'
                              >
                                {t('common.delete')}
                              </Button>
                            </div>
                          )}
                        </div>
                        {editingCommentId === comment.id ? (
                          <div className='mt-2 space-y-2'>
                            <Textarea
                              value={editingCommentText}
                              onChange={(e) => setEditingCommentText(e.target.value)}
                              className='min-h-[80px]'
                              maxLength={2000}
                            />
                            <div className='flex items-center gap-2 text-xs'>
                              <Button
                                onClick={() => saveEditComment(comment)}
                                size='xs'
                              >
                                {t('common.save')}
                              </Button>
                              <Button
                                onClick={cancelEditComment}
                                variant='outline'
                                size='xs'
                              >
                                {t('common.cancel')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className='mt-1 text-sm leading-relaxed whitespace-pre-wrap text-[var(--hn-fg-2)]'>
                              {comment.content}
                            </p>
                            <div className='flex items-center gap-1 mt-1.5'>
                              <CommentLikeButton />
                              {/* 답글(스레드)은 현 평면 댓글 모델 미지원 — 향후 지원 표시용 disabled */}
                              <Button variant='ghost' size='xs' className='text-muted-foreground' disabled>
                                답글
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <Separator />

            <div className='flex gap-3'>
              <div className='w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0'>
                {(userId || '?').charAt(0).toUpperCase()}
              </div>
              <div className='flex-1 space-y-2'>
                <Textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  className='min-h-[90px]'
                  placeholder={t('board.comment_placeholder')}
                  maxLength={2000}
                />
                <div className='flex items-center justify-between text-xs text-muted-foreground'>
                  <span>{t('common.char_count', { current: commentInput.length, max: '2,000' })}</span>
                  <Button
                    onClick={submitComment}
                    disabled={savingComment}
                    size='sm'
                  >
                    <Send className='h-4 w-4' />
                    {savingComment ? t('board.comment_submitting') : t('board.submit_comment')}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
