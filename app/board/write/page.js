'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { Heading2, Bold, Italic, List, Quote, Code, Link as LinkIcon, Paperclip } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/useTranslation';
import {
  clearBoardDraft,
  loadBoardDraft,
  saveBoardDraft,
} from '@/lib/board-draft.mjs';

export default function BoardWritePage() {
  const router = useRouter();
  const { alert } = useAlert();
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState('user');
  const [draftOwner, setDraftOwner] = useState('');
  const [category, setCategory] = useState('post');
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
      const ownerId = String(payload.sub || '').trim();
      setDraftOwner(ownerId);
      const draft = loadBoardDraft(localStorage, ownerId);
      if (draft) {
        setTitle(draft.title);
        setContent(draft.content);
        setCategory(
          draft.category === 'notice' && payload.role === 'admin'
            ? 'notice'
            : 'post'
        );
      }
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

  const submitPost = async () => {
    if (!title.trim() || !content.trim()) {
      alert(t('common.title_content_required'), 'warning', t('common.input_required'));
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/board/posts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          isNotice: userRole === 'admin' ? category === 'notice' : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('board.post_create_error'));
      }

      if (!clearBoardDraft(localStorage, draftOwner)) {
        logger.warn('게시글 초안 정리에 실패했지만 게시글 생성은 완료됐습니다.');
      }
      alert(t('board.post_created'), 'success', t('common.complete'));
      router.push('/board');
    } catch (error) {
      logger.error('게시글 등록 실패:', error);
      alert(error.message || t('board.post_create_failed'), 'error', t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => {
    if (!title.trim() && !content.trim()) {
      toast.info(t('board.draft_empty'));
      return;
    }
    if (saveBoardDraft(localStorage, draftOwner, { title, content, category })) {
      toast.success(t('board.draft_saved'));
    } else {
      toast.error(t('board.draft_save_failed'));
    }
  };

  // 툴바: 커서 위치/선택 영역에 마크다운 구문 삽입
  const wrapSelection = (before, after = before, placeholder = '') => {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + before.length;
      ta.setSelectionRange(pos, pos + selected.length);
    });
  };

  const prefixLine = (prefix) => {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  };

  const toolbarButtons = [
    { key: 'h', label: '제목', icon: Heading2, onClick: () => prefixLine('## ') },
    { key: 'b', label: '굵게', icon: Bold, onClick: () => wrapSelection('**', '**', '굵게') },
    { key: 'i', label: '기울임', icon: Italic, onClick: () => wrapSelection('*', '*', '기울임') },
    { key: 'list', label: '목록', icon: List, onClick: () => prefixLine('- ') },
    { key: 'quote', label: '인용', icon: Quote, onClick: () => prefixLine('> ') },
    { key: 'code', label: '코드', icon: Code, onClick: () => wrapSelection('`', '`', 'code') },
    { key: 'link', label: '링크', icon: LinkIcon, onClick: () => wrapSelection('[', '](url)', '링크 텍스트') },
  ];

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
      <div className='w-full max-w-4xl mx-auto p-6 pt-16 sm:pt-6'>
        <h1 className='sr-only'>게시글 작성</h1>
        {/* write-bar: 취소 / 임시저장 / 발행 */}
        <div className='flex items-center justify-between mb-4'>
          <Button
            onClick={() => router.push('/board')}
            variant='ghost'
          >
            <ArrowLeft className='h-4 w-4' />
            {t('common.cancel')}
          </Button>
          <div className='flex items-center gap-2'>
            <Button onClick={saveDraft} variant='outline' disabled={saving}>
              {t('board.save_draft')}
            </Button>
            <Button onClick={submitPost} disabled={saving}>
              {saving ? t('common.saving') : '발행'}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6 space-y-4'>
            <div className='flex flex-wrap items-center gap-2'>
              {[
                { key: 'notice', label: '공지', bg: 'var(--hn-warn-soft)', fg: 'var(--hn-warn)', adminOnly: true },
                { key: 'post', label: '일반', bg: 'var(--hn-surface-3)', fg: 'var(--hn-fg-muted)' },
              ]
                .filter((c) => !c.adminOnly || userRole === 'admin')
                .map((c) => {
                  const active = category === c.key;
                  return (
                    <button
                      key={c.key}
                      type='button'
                      onClick={() => setCategory(c.key)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        active
                          ? 'bg-primary/10 border border-primary text-primary font-medium'
                          : 'bg-[var(--hn-surface-2)] border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
            </div>

            {/* borderless 제목 */}
            <input
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={t('common.title_label')}
              className='w-full text-2xl font-bold bg-transparent border-0 border-b border-border focus:outline-none focus:border-primary pb-3 mb-1 placeholder:text-muted-foreground'
            />
            <p className='text-xs text-muted-foreground'>
              {t('common.char_count', { current: title.length, max: 200 })}
            </p>

            {/* 툴바 장착 에디터 블록 */}
            <div className='border border-border rounded-xl overflow-hidden bg-[var(--hn-surface)]'>
              <div className='flex flex-wrap items-center gap-1 px-3 py-2 bg-[var(--hn-surface-2)] border-b border-border'>
                {toolbarButtons.map((b) => {
                  const Icon = b.icon;
                  return (
                    <Button
                      key={b.key}
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8 sm:h-9 sm:w-9'
                      aria-label={b.label}
                      title={b.label}
                      onClick={b.onClick}
                    >
                      <Icon className='h-4 w-4' />
                    </Button>
                  );
                })}
                {/* 서식/MD 모드 토글 (시각) */}
                <div className='ml-auto flex items-center rounded-lg border border-border overflow-hidden text-xs'>
                  {[
                    { key: 'rich', label: '서식' },
                    { key: 'md', label: 'MD' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type='button'
                      onClick={() => setHnEditorMode(m.key)}
                      className={`px-2.5 py-1 transition-colors ${
                        hnEditorMode === m.key
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {hnEditorMode === 'md' ? (
                <div className='grid md:grid-cols-2'>
                  <Textarea
                    ref={contentRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={10000}
                    className='min-h-[320px] resize-y border-0 md:border-r border-border p-4 bg-transparent text-sm leading-loose focus-visible:ring-0'
                  />
                  <div className='board-prose p-4 min-h-[320px] overflow-auto border-t md:border-t-0 border-border'>
                    <MarkdownPreview
                      source={content || '*미리보기*'}
                      style={{ padding: 0, backgroundColor: 'transparent', color: 'inherit' }}
                    />
                  </div>
                </div>
              ) : (
                <Textarea
                  ref={contentRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={10000}
                  className='min-h-[320px] resize-y border-0 p-4 bg-transparent text-sm leading-loose focus-visible:ring-0'
                />
              )}

              <div className='flex items-center justify-between px-4 py-2 border-t border-border bg-[var(--hn-surface-2)] text-xs text-muted-foreground'>
                <span className='inline-flex items-center gap-1.5'>
                  <Paperclip className='h-3.5 w-3.5' />
                  파일 첨부
                </span>
                <span>{t('common.char_count', { current: content.length, max: '10,000' })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
