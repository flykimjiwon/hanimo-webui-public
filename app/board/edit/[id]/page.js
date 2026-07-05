'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { Heading2, Bold, Italic, List, Quote, Code, Link as LinkIcon, Paperclip, Save } from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
  loading: () => <div className='animate-pulse h-4 bg-muted rounded w-3/4' />,
});
import { useAlert } from '@/contexts/AlertContext';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/useTranslation';

export default function BoardEditPage() {
  const router = useRouter();
  const params = useParams();
  const { alert } = useAlert();
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('user');
  const [userId, setUserId] = useState('');
  // category는 UI 전용(DB는 isNotice bool만 보유) — isNotice = (category === 'notice')로만 전송
  const [category, setCategory] = useState('doc');
  const [isNotice, setIsNotice] = useState(false);
  const [hnEditorMode, setHnEditorMode] = useState('rich'); // 'rich' | 'md' — 시각 토글
  const [boardEnabled, setBoardEnabled] = useState(true);
  const contentRef = useRef(null);

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
      const post = data.post;
      if (!post) {
        throw new Error(t('board.post_not_found'));
      }

      if (userRole !== 'admin' && post.userId !== userId) {
        alert(t('board.no_edit_permission'), 'error', t('common.no_permission'));
        router.push('/board');
        return;
      }

      setTitle(post.title);
      setContent(post.content);
      setIsNotice(Boolean(post.isNotice));
    } catch (error) {
      logger.error('게시글 조회 실패:', error);
      alert(error.message || t('board.post_fetch_failed'), 'error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [alert, params.id, router, userId, userRole, t]);

  useEffect(() => {
    if (boardEnabled && userId) {
      fetchPost();
    }
  }, [boardEnabled, fetchPost, userId]);

  const submitUpdate = async () => {
    if (!title.trim() || !content.trim()) {
      alert(t('common.title_content_required'), 'warning', t('common.input_required'));
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/board/posts/${params.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          isNotice: userRole === 'admin' ? isNotice : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.post_update_error'));
      }

      alert(t('board.post_updated'), 'success', t('common.complete'));
      router.push(`/board/${params.id}`);
    } catch (error) {
      logger.error('게시글 수정 실패:', error);
      alert(error.message || t('board.post_update_failed'), 'error', t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!boardEnabled) {
    return (
      <div className='min-h-screen bg-background'>
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
    <div className='min-h-screen bg-background'>
      <div className='w-full max-w-4xl mx-auto p-6'>
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-4'>
            <Button
              onClick={() => router.push(`/board/${params.id}`)}
              variant='ghost'
              size='icon'
              title={t('common.go_back')}
            >
              <ArrowLeft className='h-5 w-5' />
            </Button>
            <h1 className='text-2xl font-bold text-foreground'>
              {t('board.edit_title')}
            </h1>
          </div>
          <Button
            onClick={submitUpdate}
            disabled={saving}
          >
            <Save className='h-4 w-4' />
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>

        <Card>
          <CardContent className='p-6 space-y-4'>
            {loading ? (
              <div className='flex items-center justify-center h-32'>
                <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
              </div>
            ) : (
              <>
                <div>
                  <Label className='mb-2'>
                    {t('common.title_label')}
                  </Label>
                  <Input
                    type='text'
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                  />
                  <p className='text-xs text-muted-foreground mt-1'>
                    {t('common.char_count', { current: title.length, max: 200 })}
                  </p>
                </div>

                <div>
                  <Label className='mb-2'>
                    {t('common.content_label')}
                  </Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className='min-h-[220px]'
                    maxLength={10000}
                  />
                  <p className='text-xs text-muted-foreground mt-1'>
                    {t('common.char_count', { current: content.length, max: '10,000' })}
                  </p>
                </div>

                {userRole === 'admin' && (
                  <div className='flex items-center justify-between border border-border rounded-lg p-4 bg-muted'>
                    <div>
                      <p className='text-sm font-medium text-foreground'>
                        {t('board.notice_register')}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {t('board.notice_register_desc')}
                      </p>
                    </div>
                    <Switch
                      checked={isNotice}
                      onCheckedChange={setIsNotice}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
