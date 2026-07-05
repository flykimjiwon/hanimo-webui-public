'use client';


import logger from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Save, ArrowLeft, Eye } from '@/components/icons';
import dynamic from 'next/dynamic';
const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-4 bg-muted rounded w-3/4" />,
});
import { useAlert } from '@/contexts/AlertContext';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from '@/hooks/useTranslation';

const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default),
  { ssr: false }
);

export default function NoticeEditPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPopup, setIsPopup] = useState(false);
  const [isPopupLogin, setIsPopupLogin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [popupWidth, setPopupWidth] = useState(512);
  const [popupHeight, setPopupHeight] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
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
      if (payload.role !== 'admin') {
        alert(t('notice.admin_required'), 'warning', t('notice.permission_error'));
        router.push('/notice');
        return;
      }
      setUserRole(payload.role);
    } catch (error) {
      logger.error('토큰 파싱 실패:', error);
      localStorage.removeItem('token');
      router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
    }
  }, [router, alert, t]);

  useEffect(() => {
    const fetchNotice = async () => {
      if (userRole !== 'admin') return;

      try {
        setLoading(true);
        const response = await fetch(`/api/notice/${id}`);

        if (response.status === 404) {
          alert(t('notice.not_found_msg'), 'error', t('notice.fetch_failed_title'));
          router.push('/notice');
          return;
        }

        if (!response.ok) {
          throw new Error(t('notice.fetch_error'));
        }

        const data = await response.json();
        const noticeData = data.notice;

        setTitle(noticeData.title);
        setContent(noticeData.content);
        setIsPopup(noticeData.isPopup);
        setIsPopupLogin(!!noticeData.isPopupLogin);
        setIsActive(noticeData.isActive);
        setPopupWidth(noticeData.popupWidth || 512);
        setPopupHeight(noticeData.popupHeight || '');
      } catch (error) {
        logger.error('공지사항 조회 실패:', error);
        alert(t('notice.fetch_failed'), 'error', t('notice.fetch_failed_title'));
        router.push('/notice');
      } finally {
        setLoading(false);
      }
    };

    if (id && userRole === 'admin') {
      fetchNotice();
    }
  }, [id, router, userRole, alert, t]);

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        alert(t('notice.file_size_exceeded'), 'warning', t('notice.file_size_limit'));
        return;
      }

      try {
        const formData = new FormData();
        formData.append('image', file);

        const token = localStorage.getItem('token');
        const response = await fetch('/api/upload/image', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (response.status === 401) {
          alert(t('notice.login_required'), 'warning', t('notice.auth_required'));
          return;
        }

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || t('notice.image_upload_error'));
        }

        const result = await response.json();

        const imageMarkdown = `![${file.name}](${result.url})`;
        const newContent = content + '\n\n' + imageMarkdown;
        setContent(newContent);

        alert(t('notice.image_uploaded'), 'success', t('notice.upload_complete'));
      } catch (error) {
        logger.error('이미지 업로드 실패:', error);
        alert(error.message || t('notice.image_upload_failed'), 'error', t('notice.upload_failed'));
      }
    };
    input.click();
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      alert(t('common.title_content_required'), 'warning', t('notice.input_error'));
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/notice/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          isPopup,
          isPopupLogin,
          isActive,
          popupWidth: popupWidth ? parseInt(popupWidth, 10) : null,
          popupHeight: popupHeight ? parseInt(popupHeight, 10) : null,
        }),
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('notice.update_error'));
      }

      alert(t('notice.updated'), 'success', t('notice.update_complete'));
      router.push(`/notice/${id}`);
    } catch (error) {
      logger.error('공지사항 수정 실패:', error);
      alert(error.message || t('notice.update_failed'), 'error', t('notice.update_failed_title'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
      </div>
    );
  }

  if (userRole !== 'admin') {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='text-center'>
          <h3 className='text-lg font-medium text-foreground'>
            {t('notice.no_permission')}
          </h3>
          <Button
            onClick={() => router.push('/notice')}
            variant='link'
            className='mt-4'
          >
            {t('common.back_to_list_full')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background transition-colors duration-200'>
      <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto p-6'>
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-4'>
            <Button
              onClick={() => {
                if (id) {
                  router.push(`/notice/${id}`);
                } else {
                  router.push('/');
                }
              }}
              variant='ghost'
              size='icon'
              title={t('common.go_back')}
            >
              <ArrowLeft className='h-5 w-5' />
            </Button>
            <h1 className='text-2xl font-bold text-foreground'>
              {t('notice.edit_title')}
            </h1>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              onClick={() => setPreviewMode(!previewMode)}
              variant='outline'
            >
              <Eye className='h-4 w-4' />
              {previewMode ? t('common.edit') : t('notice.preview')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
            >
              <Save className='h-4 w-4' />
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <div className='mb-4'>
              <Label className='mb-2'>
                {t('common.title_label')}
              </Label>
              <Input
                type='text'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('notice.title_placeholder')}
              />
            </div>

            <div className='flex items-center gap-6 mb-4'>
              <label className='flex items-center gap-2'>
                <Checkbox
                  checked={isPopup}
                  onCheckedChange={(checked) => setIsPopup(!!checked)}
                />
                <span className='text-sm text-foreground'>
                  {t('notice.show_main_popup')}
                </span>
              </label>
              <label className='flex items-center gap-2'>
                <Checkbox
                  checked={isPopupLogin}
                  onCheckedChange={(checked) => setIsPopupLogin(!!checked)}
                />
                <span className='text-sm text-foreground'>
                  {t('notice.show_login_popup')}
                </span>
              </label>
              <label className='flex items-center gap-2'>
                <Checkbox
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(!!checked)}
                />
                <span className='text-sm text-foreground'>
                  {t('notice.active')}
                </span>
              </label>
            </div>

            {(isPopup || isPopupLogin) && (
              <div className='flex items-center gap-4 mb-4 p-3 bg-muted rounded-lg'>
                <span className='text-sm font-medium text-foreground'>{t('notice.popup_size')}</span>
                <div className='flex items-center gap-2'>
                  <Label className='text-sm text-muted-foreground'>{t('notice.width')}</Label>
                  <Input
                    type='number'
                    value={popupWidth}
                    onChange={(e) => setPopupWidth(e.target.value)}
                    className='w-20 h-8 text-sm'
                    placeholder='512'
                    min='300'
                    max='1200'
                  />
                  <span className='text-xs text-muted-foreground'>px</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Label className='text-sm text-muted-foreground'>{t('notice.height')}</Label>
                  <Input
                    type='number'
                    value={popupHeight}
                    onChange={(e) => setPopupHeight(e.target.value)}
                    className='w-20 h-8 text-sm'
                    placeholder={t('notice.auto')}
                    min='200'
                    max='900'
                  />
                  <span className='text-xs text-muted-foreground'>{t('notice.height_auto_hint')}</span>
                </div>
              </div>
            )}

            <div className='mb-4'>
              <Label className='mb-2'>
                {t('common.content_label')}
              </Label>
              {previewMode ? (
                <div className='min-h-[400px] p-4 border border-border rounded-lg bg-muted'>
                  <MarkdownPreview
                    source={content}
                    style={{ backgroundColor: 'transparent' }}
                  />
                </div>
              ) : (
                <div>
                  <div className='mb-2 flex justify-end'>
                    <Button
                      type='button'
                      onClick={handleImageUpload}
                      variant='outline'
                      size='sm'
                    >
                      <svg
                        width='16'
                        height='16'
                        viewBox='0 0 24 24'
                        fill='currentColor'
                      >
                        <path d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z' />
                      </svg>
                      {t('notice.image_upload')}
                    </Button>
                  </div>

                  <div className='border border-border rounded-lg overflow-hidden'>
                    <MDEditor
                      value={content}
                      onChange={(value) => setContent(value || '')}
                      height={400}
                      data-color-mode='auto'
                    />
                  </div>
                </div>
              )}
            </div>

            <div className='text-xs text-muted-foreground'>
              <p className='mb-1'>{t('notice.markdown_hint')}</p>
              <p>{t('notice.markdown_syntax')}</p>
              <p>{t('notice.markdown_image')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
