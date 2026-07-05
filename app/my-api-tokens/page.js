'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  RefreshCw,
  Calendar,
  Zap,
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Power,
  PowerOff,
  ExternalLink,
  Check,
  ChevronDown,
  ChevronUp,
} from '@/components/icons';
import dynamic from 'next/dynamic';
const AlertModal = dynamic(() => import('@/components/ui/modal').then(m => m.AlertModal), { ssr: false });
const ConfirmModal = dynamic(() => import('@/components/ui/modal').then(m => m.ConfirmModal), { ssr: false });
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function MyApiKeysPage() {
  const router = useRouter();
  const { t, loadNamespace } = useTranslation();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [tokenName, setTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showTokenInfoModal, setShowTokenInfoModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [copiedStates, setCopiedStates] = useState({});
  const [selectedApiTokenId, setSelectedApiTokenId] = useState('');
  const [presetBaseUrl, setPresetBaseUrl] = useState('');
  const [presetApiBase, setPresetApiBase] = useState('');
  const [apiConfigExample, setApiConfigExample] = useState('');
  const [apiCurlExample, setApiCurlExample] = useState('');
  const [isTokenSectionExpanded, setIsTokenSectionExpanded] = useState(true);
  const [isApiSectionExpanded, setIsApiSectionExpanded] = useState(false);
  const [translationsReady, setTranslationsReady] = useState(false);
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '', type: 'error' });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false, 
    title: '', 
    message: '', 
    type: 'warning', 
    onConfirm: null,
    confirmText: t('my_api_tokens.confirm'),
    cancelText: t('my_api_tokens.cancel')
  });

  useEffect(() => {
    let cancelled = false;
    loadNamespace('my_api_tokens').finally(() => {
      if (!cancelled) setTranslationsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadNamespace]);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });

      const response = await fetch(`/api/user/api-keys?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTokens(data.data.tokens || []);
        setTotalPages(data.data.pagination.totalPages);
        setTotalCount(data.data.pagination.totalCount);
      } else if (response.status === 401) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
      } else {
        let errorData = {};
        try {
          const text = await response.text();
          if (text) {
            errorData = JSON.parse(text);
          }
        } catch (parseError) {
          logger.error(t('my_api_tokens.error_response_parse_failed'), parseError);
        }
        
        const errorMessage = errorData.error || t('my_api_tokens.error_key_list_fetch_failed');
        const errorDetails = errorData.details || errorData.hint || '';
        const errorCode = errorData.code || '';
        
        const modalMessage = `${errorMessage}${errorDetails ? `\n\n${t('my_api_tokens.detail_prefix')} ${errorDetails}` : ''}${errorCode ? `\n\n${t('my_api_tokens.code_prefix')} ${errorCode}` : ''}`;
        
        setErrorModal({
          isOpen: true,
          title: t('my_api_tokens.error_key_list_fetch_failed'),
          message: modalMessage,
          type: 'error'
        });
      }
    } catch (error) {
      logger.error(t('my_api_tokens.error_key_list_fetch_error'), error);
      setErrorModal({
        isOpen: true,
        title: t('my_api_tokens.error_key_list_fetch_error_title'),
        message: error.message || t('my_api_tokens.error_key_list_fetch_error_message'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, router, t]);

  const createToken = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: tokenName || undefined,
          expiresInDays: parseInt(expiresInDays),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewToken(data.data.token);
        setSelectedApiTokenId(data.data.tokenInfo?._id || '');
        setShowCreateModal(false);
        setShowTokenModal(true);
        setTokenName('');
        fetchTokens();
      } else {
        const error = await response.json();
        setErrorModal({
          isOpen: true,
          title: t('my_api_tokens.error_key_issue_failed'),
          message: error.error || t('my_api_tokens.error_key_issue_failed_message'),
          type: 'error'
        });
      }
    } catch (error) {
      logger.error(t('my_api_tokens.error_key_issue_error'), error);
      setErrorModal({
        isOpen: true,
        title: t('my_api_tokens.error_key_issue_error_title'),
        message: t('my_api_tokens.error_key_issue_error_message'),
        type: 'error'
      });
    }
  };

  const deleteToken = async (tokenId) => {
    setConfirmModal({
      isOpen: true,
      title: t('my_api_tokens.delete_key'),
      message: t('my_api_tokens.delete_key_confirm'),
      type: 'warning',
      confirmText: t('my_api_tokens.delete'),
      cancelText: t('my_api_tokens.cancel'),
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/user/api-keys?id=${tokenId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            toast.success(t('my_api_tokens.delete_complete'));
            fetchTokens();
          } else {
            const error = await response.json();
            setErrorModal({
              isOpen: true,
              title: t('my_api_tokens.error_key_delete_failed'),
              message: error.error || t('my_api_tokens.error_key_delete_failed_message'),
              type: 'error'
            });
          }
        } catch (error) {
          logger.error(t('my_api_tokens.error_key_delete_error'), error);
          setErrorModal({
            isOpen: true,
            title: t('my_api_tokens.error_key_delete_error_title'),
            message: t('my_api_tokens.error_key_delete_error_message'),
            type: 'error'
          });
        }
      }
    });
  };

  const toggleTokenStatus = async (tokenId, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/api-keys', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: tokenId,
          isActive: !currentStatus,
        }),
      });

      if (response.ok) {
        fetchTokens();
      } else {
        const error = await response.json();
        setErrorModal({
          isOpen: true,
          title: t('my_api_tokens.error_key_status_change_failed'),
          message: error.error || t('my_api_tokens.error_key_status_change_failed_message'),
          type: 'error'
        });
      }
    } catch (error) {
      logger.error(t('my_api_tokens.error_key_status_change_error'), error);
      setErrorModal({
        isOpen: true,
        title: t('my_api_tokens.error_key_status_change_error_title'),
        message: t('my_api_tokens.error_key_status_change_error_message'),
        type: 'error'
      });
    }
  };

  const copyToken = async (token, key = 'token') => {
    await copyToClipboard(token, key);
  };

  const regenerateToken = async (tokenId, tokenName, expiresInDays) => {
    setConfirmModal({
      isOpen: true,
      title: t('my_api_tokens.regenerate_key'),
      message: t('my_api_tokens.regenerate_key_confirm'),
      type: 'warning',
      confirmText: t('my_api_tokens.regenerate'),
      cancelText: t('my_api_tokens.cancel'),
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('token');

          await fetch('/api/user/api-keys', {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: tokenId,
              isActive: false,
            }),
          });

          const response = await fetch('/api/user/api-keys', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: tokenName,
              expiresInDays: expiresInDays || 90,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            setNewToken(data.data.token);
            setSelectedApiTokenId(data.data.tokenInfo?._id || '');
            setShowTokenInfoModal(false);
            setShowTokenModal(true);
            setSelectedToken(null);
            fetchTokens();
          } else {
            const error = await response.json();
            setErrorModal({
              isOpen: true,
              title: t('my_api_tokens.error_key_regenerate_failed'),
              message: error.error || t('my_api_tokens.error_key_regenerate_failed_message'),
              type: 'error'
            });
          }
        } catch (error) {
          logger.error(t('my_api_tokens.error_key_regenerate_error'), error);
          setErrorModal({
            isOpen: true,
            title: t('my_api_tokens.error_key_regenerate_error_title'),
            message: t('my_api_tokens.error_key_regenerate_error_message'),
            type: 'error'
          });
        }
      }
    });
  };

  useEffect(() => {
    if (!translationsReady) return;
    fetchTokens();
  }, [fetchTokens, translationsReady]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getServerUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'http://localhost:3000';
  };

  const apiBaseUrl = getServerUrl();
  const normalizeBaseWithV1 = (value, fallback) => {
    const trimmed =
      typeof value === 'string' && value.trim() ? value.trim() : '';
    if (!trimmed) return `${fallback}/v1`;
    const cleaned = trimmed.replace(/\/+$/, '');
    return cleaned.endsWith('/v1') ? cleaned : `${cleaned}/v1`;
  };
  const resolvedApiBaseUrl = normalizeBaseWithV1(presetApiBase, apiBaseUrl);

  const fetchPresetSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) return;
      const data = await res.json();
      setPresetBaseUrl(data.manualPresetBaseUrl || '');
      setPresetApiBase(data.manualPresetApiBase || '');
      setApiConfigExample(data.apiConfigExample || '');
      setApiCurlExample(data.apiCurlExample || '');
    } catch (error) {
      logger.warn(t('my_api_tokens.error_preset_url_load_failed'), error.message);
    }
  }, [t]);

  useEffect(() => {
    if (!translationsReady) return;
    fetchPresetSettings();
  }, [fetchPresetSettings, translationsReady]);

  const copyToClipboard = async (text, key) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!successful) throw new Error('Fallback copy failed');
      }
      setCopiedStates((prev) => ({ ...prev, [key]: true }));
      setTimeout(
        () => setCopiedStates((prev) => ({ ...prev, [key]: false })),
        2000
      );
      toast.success(t('my_api_tokens.copy_complete'));
    } catch (err) {
      logger.error(t('my_api_tokens.error_clipboard_copy_failed'), err);
      setErrorModal({
        isOpen: true,
        title: t('my_api_tokens.copy_failed'),
        message: t('my_api_tokens.copy_failed_message', { text }),
        type: 'error'
      });
    }
  };

  const replacePlaceholders = (text, apiKey) => {
    const selectedKey = apiKey && apiKey.trim() ? apiKey : '{{KEY}}';
    return text
      .replace(/\{\{KEY\}\}/g, selectedKey)
      .replace(/\{\{TOKEN\}\}/g, selectedKey);
  };

  const getDefaultConfigExample = (token) => {
    const baseUrl = normalizeBaseWithV1(presetBaseUrl, apiBaseUrl);
    const tokenValue = token && token.trim() ? token : '{{KEY}}';
    return `name: Local Agent
version: 1.0.0
schema: v1
models:
  - title: "My Chat Model"
    provider: "openai"
    model: "gemma3:4b"
    apiKey: "${tokenValue}"
    baseUrl: "${baseUrl}"`;
  };

  const getDefaultCurlExample = (token) => {
    const tokenValue = token && token.trim() ? token : '{{KEY}}';
    return `curl -X POST ${resolvedApiBaseUrl}/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer ${tokenValue}" ^
  -d "{\\"model\\": \\"gemma3:4b\\", \\"messages\\": [{\\"role\\": \\"user\\", \\"content\\": \\"Hello!\\"}], \\"stream\\": true}"`;
  };

  const buildConfigPresetText = () => {
    const token = '{{KEY}}';

    if (apiConfigExample.trim()) {
      return replacePlaceholders(apiConfigExample, token);
    }
    return getDefaultConfigExample(token);
  };

  const buildCurlExampleText = () => {
    const token = '{{KEY}}';

    if (apiCurlExample.trim()) {
      return replacePlaceholders(apiCurlExample, token);
    }
    return getDefaultCurlExample(token);
  };

  if (!translationsReady) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <RefreshCw className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background transition-colors duration-200'>
      <div className='w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6'>
        <div className='mb-4'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => router.push('/')}
            className='mb-3'
          >
            <ArrowLeft className='h-4 w-4 mr-1' />
            {t('my_api_tokens.go_back')}
          </Button>
        </div>

        <PageHead
          eyebrow={t('my_api_tokens.eyebrow')}
          title={t('my_api_tokens.page_title')}
          sub={t('my_api_tokens.page_description')}
          actions={
            <Button
              variant='ghost'
              size='icon'
              onClick={() =>
                setIsTokenSectionExpanded(!isTokenSectionExpanded)
              }
              aria-label={isTokenSectionExpanded ? t('my_api_tokens.collapse') : t('my_api_tokens.expand')}
            >
              {isTokenSectionExpanded ? (
                <ChevronUp className='h-5 w-5' />
              ) : (
                <ChevronDown className='h-5 w-5' />
              )}
            </Button>
          }
        />

        <Card className='py-0 gap-0'>
          <CardContent className='p-4 sm:p-5'>
            {isTokenSectionExpanded && (
              <>
                <div className='bg-primary/5 border border-primary/20 rounded-lg p-3 sm:p-4 mb-4'>
                  <div className='flex items-start gap-3'>
                    <AlertCircle className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
                    <div className='flex-1 text-sm text-primary'>
                      <p className='font-semibold mb-1.5'>{t('my_api_tokens.usage_guide_title')}</p>
                      <ul className='space-y-1 text-primary/80'>
                        <li className='flex items-start gap-2'>
                          <span className='text-primary/70 mt-1'>•</span>
                          <span>
                            {t('my_api_tokens.usage_guide_1')}
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <span className='text-primary/70 mt-1'>•</span>
                          <span>
                            {t('my_api_tokens.usage_guide_2')}
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <span className='text-primary/70 mt-1'>•</span>
                          <span>
                            {t('my_api_tokens.usage_guide_3')}
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <span className='text-primary/70 mt-1'>•</span>
                          <span>
                            {t('my_api_tokens.usage_guide_4')}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className='grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mb-5'>
                  <div className='bg-muted/60 rounded-xl p-4 border border-border'>
                    <p className='text-xs text-muted-foreground mb-1'>{t('my_api_tokens.this_month_calls')}</p>
                    <p className='text-2xl font-bold tracking-tight text-foreground'>
                      {totalCount > 0 ? tokens.reduce((s, tok) => s + (tok.usage?.requestCount || 0), 0).toLocaleString() : '-'}
                    </p>
                  </div>
                  <div className='bg-muted/60 rounded-xl p-4 border border-border'>
                    <p className='text-xs text-muted-foreground mb-1'>{t('my_api_tokens.active_keys')}</p>
                    <p className='text-2xl font-bold tracking-tight text-foreground'>
                      {tokens.filter(tok => tok.isActive).length}
                    </p>
                  </div>
                </div>

                <div className='flex items-center justify-between mb-4'>
                  <h2 className='text-lg font-semibold text-foreground flex items-center gap-2'>
                    {t('my_api_tokens.my_key_list')}
                    <span className='text-sm font-normal text-muted-foreground'>
                      ({totalCount.toLocaleString()})
                    </span>
                  </h2>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={fetchTokens}
                      disabled={loading}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                      />
                      {t('my_api_tokens.refresh')}
                    </Button>
                    <Button
                      size='sm'
                      onClick={() => setShowCreateModal(true)}
                      disabled={tokens.some((t) => t.isActive)}
                      title={tokens.some((t) => t.isActive) ? t('my_api_tokens.active_key_exists_tooltip') : t('my_api_tokens.issue_new_key')}
                    >
                      <Plus className='h-4 w-4' />
                      {t('my_api_tokens.issue_key')}
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <div className='flex items-center justify-center py-8'>
                    <RefreshCw className='h-6 w-6 animate-spin text-muted-foreground' />
                  </div>
                ) : tokens.length === 0 ? (
                  <div className='text-center py-8'>
                    <div className='inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-3'>
                      <Key className='h-8 w-8 text-muted-foreground' />
                    </div>
                    <p className='text-muted-foreground mb-1.5 font-medium'>
                      {t('my_api_tokens.no_keys')}
                    </p>
                    <p className='text-sm text-muted-foreground mb-4'>
                      {t('my_api_tokens.no_keys_description')}
                    </p>
                    <Button
                      onClick={() => setShowCreateModal(true)}
                    >
                      <Plus className='h-4 w-4' />{t('my_api_tokens.issue_first_key')}
                    </Button>
                  </div>
                ) : (
                  <div className='space-y-2'>
                    {tokens.map((token) => (
                      <div
                        key={token._id}
                        className='flex items-start justify-between gap-3 border border-border rounded-xl px-[18px] py-[14px] hover:border-foreground/30 hover:-translate-y-px transition-all duration-[150ms]'
                      >
                        <div className='flex items-start gap-3 flex-1 min-w-0'>
                          <span className='inline-flex items-center justify-center w-[38px] h-[38px] rounded-[10px] bg-muted text-muted-foreground flex-shrink-0 mt-0.5'>
                            <Key className='h-4 w-4' />
                          </span>
                          <div className='flex-1 min-w-0'>
                            <div className='flex flex-wrap items-center gap-2 mb-1.5'>
                              <span className='font-semibold text-foreground'>
                                {token.name || t('my_api_tokens.unnamed')}
                              </span>
                              {token.isActive ? (
                                <span className='inline-flex items-center gap-1 text-[11px] font-bold text-[var(--hn-good)] bg-[var(--hn-good-soft)] px-2 py-0.5 rounded-full'>{t('my_api_tokens.active')}</span>
                              ) : (
                                <span className='inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>{t('my_api_tokens.inactive')}</span>
                              )}
                              {isExpired(token.expiresAt) && (
                                <span className='inline-flex items-center gap-1 text-[11px] font-bold text-[var(--hn-error)] bg-[var(--hn-error-soft)] px-2 py-0.5 rounded-full'>{t('my_api_tokens.expired')}</span>
                              )}
                            </div>
                            <div className='space-y-1.5 font-mono text-xs text-muted-foreground'>
                              <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
                                <div className='flex items-center gap-1.5'>
                                  <Calendar className='h-3.5 w-3.5' />
                                  <span>
                                    {t('my_api_tokens.issued')}: {formatDate(token.createdAt)}
                                  </span>
                                </div>
                                {token.expiresAt && (
                                  <div className='flex items-center gap-1.5'>
                                    <Calendar className='h-3.5 w-3.5' />
                                    <span>
                                      {t('my_api_tokens.expires')}: {formatDate(token.expiresAt)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
                                <div className='flex items-center gap-1.5'>
                                  <Zap className='h-3.5 w-3.5' />
                                  <span>
                                    {t('my_api_tokens.usage')}:{' '}
                                    <strong>
                                      {t('my_api_tokens.request_count', { count: token.usage?.requestCount || 0 })}
                                    </strong>
                                    {token.usage?.totalTokens && (
                                      <>
                                        {' '}
                                        /{' '}
                                        <strong>
                                          {(
                                            token.usage.totalTokens / 1000
                                          ).toFixed(1)}
                                          K
                                        </strong>{' '}
                                        {t('my_api_tokens.tokens_unit')}
                                      </>
                                    )}
                                  </span>
                                </div>
                                {token.usage?.lastUsed && (
                                  <span>
                                    {t('my_api_tokens.last_used')}:{' '}
                                    {formatDate(token.usage.lastUsed)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className='flex items-center gap-2 sm:flex-shrink-0'>
                            <Button
                              variant='ghost'
                              size='icon'
                              onClick={() => {
                                setSelectedToken(token);
                                setShowTokenInfoModal(true);
                              }}
                              title={t('my_api_tokens.view_key_info')}
                            >
                              <Eye className='h-4 w-4' />
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              onClick={() =>
                                toggleTokenStatus(token._id, token.isActive)
                              }
                              className={
                                token.isActive
                                  ? 'text-primary hover:text-primary hover:bg-primary/10'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                              }
                              title={token.isActive ? t('my_api_tokens.deactivate') : t('my_api_tokens.activate')}
                            >
                              {token.isActive ? (
                                <Power className='h-4 w-4' />
                              ) : (
                                <PowerOff className='h-4 w-4' />
                              )}
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              onClick={() => deleteToken(token._id)}
                              className='text-destructive hover:text-destructive hover:bg-destructive/10'
                              title={t('my_api_tokens.delete')}
	                            >
	                              <Trash2 className='h-4 w-4' />
	                            </Button>
	                          </div>
	                        </div>
	                      </div>
	                    ))}
	                  </div>
                )}

                {totalPages > 1 && (
                  <div className='flex items-center justify-between mt-4 pt-4 border-t border-border'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      {t('my_api_tokens.previous')}
                    </Button>
                    <span className='text-sm font-medium text-foreground'>
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      {t('my_api_tokens.next')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 키 발급 모달 */}
        <Dialog open={showCreateModal} onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false);
            setTokenName('');
          }
        }}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>{t('my_api_tokens.create_modal_title')}</DialogTitle>
              <DialogDescription>{t('my_api_tokens.create_modal_description')}</DialogDescription>
            </DialogHeader>

            <div className='space-y-5'>
              <div>
                <Label className='mb-2 block'>
                  {t('my_api_tokens.key_name')}{' '}
                  <span className='text-muted-foreground text-xs'>({t('my_api_tokens.optional')})</span>
                </Label>
                <Input
                  type='text'
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder={t('my_api_tokens.key_name_placeholder')}
                />
              </div>

              <div>
                <Label className='mb-2 block'>
                  {t('my_api_tokens.expiry_days')}
                </Label>
                <Input
                  type='number'
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  min='1'
                  max='365'
                />
                <p className='text-xs text-muted-foreground mt-2'>
                  {t('my_api_tokens.expiry_days_description')}
                </p>
              </div>
            </div>

            <DialogFooter className='gap-3 sm:gap-3'>
              <Button
                variant='outline'
                className='flex-1'
                onClick={() => {
                  setShowCreateModal(false);
                  setTokenName('');
                }}
              >
                {t('my_api_tokens.cancel')}
              </Button>
              <Button className='flex-1' onClick={createToken}>
                {t('my_api_tokens.issue')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 발급된 키 표시 모달 */}
        <Dialog open={showTokenModal && !!newToken} onOpenChange={(open) => {
          if (!open) {
            setShowTokenModal(false);
            setNewToken(null);
          }
        }}>
          <DialogContent className='sm:max-w-2xl'>
            <DialogHeader>
              <div className='flex items-center gap-2'>
                <CheckCircle className='h-6 w-6 text-primary' />
                <DialogTitle>{t('my_api_tokens.key_issued_title')}</DialogTitle>
              </div>
              <DialogDescription>{t('my_api_tokens.key_issued_description')}</DialogDescription>
            </DialogHeader>

            <div className='mb-5'>
              <Label className='mb-2 block'>{t('my_api_tokens.api_key')}</Label>
              <div className='flex items-center gap-2'>
                <Input
                  type='text'
                  value={newToken || ''}
                  readOnly
                  className='flex-1 font-mono text-sm'
                />
                <Button
                  onClick={() => copyToken(newToken, 'newToken')}
                >
                  <Copy className='h-4 w-4' />
                  {t('my_api_tokens.copy')}
                </Button>
              </div>
            </div>

            <div className='mb-6'>
              <div className='flex items-center justify-between mb-2'>
                <p className='text-sm font-medium text-foreground'>
                  {t('my_api_tokens.usage_example')}:
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    const curlExample = apiCurlExample.trim()
                      ? replacePlaceholders(apiCurlExample, newToken)
                      : getDefaultCurlExample(newToken);
                    copyToClipboard(curlExample, 'newTokenCurl');
                  }}
                >
                  {copiedStates.newTokenCurl ? (
                    <Check className='h-3 w-3 text-primary' />
                  ) : (
                    <Copy className='h-3 w-3' />
                  )}
                  {t('my_api_tokens.copy_example')}
                </Button>
              </div>
              <div className='bg-muted rounded-lg p-4 border border-border'>
                <pre className='text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap'>
                  {apiCurlExample.trim()
                    ? replacePlaceholders(apiCurlExample, newToken)
                    : getDefaultCurlExample(newToken)}
                </pre>
              </div>
            </div>

            <DialogFooter>
              <Button
                className='w-full'
                onClick={() => {
                  setShowTokenModal(false);
                  setNewToken(null);
                }}
              >
                {t('my_api_tokens.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 키 정보 보기 모달 */}
        <Dialog open={showTokenInfoModal && !!selectedToken} onOpenChange={(open) => {
          if (!open) {
            setShowTokenInfoModal(false);
            setSelectedToken(null);
          }
        }}>
          <DialogContent className='sm:max-w-2xl max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <div className='flex items-center gap-2'>
                <Key className='h-5 w-5 text-muted-foreground' />
                <DialogTitle>{t('my_api_tokens.key_info_title')}</DialogTitle>
              </div>
            </DialogHeader>

            {selectedToken && (
              <div className='space-y-5'>
                <div>
                  <Label className='mb-2 block'>{t('my_api_tokens.key_name')}</Label>
                  <div className='px-3 py-2 border border-input rounded-md bg-muted text-foreground'>
                    {selectedToken.name || t('my_api_tokens.unnamed')}
                  </div>
                </div>

                <div>
                  <Label className='mb-2 block'>{t('my_api_tokens.api_key')}</Label>
                  <div className='px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground text-sm'>
                    {t('my_api_tokens.key_unavailable')}
                  </div>
                </div>

                <div>
                  <Label className='mb-2 block'>{t('my_api_tokens.status')}</Label>
                  <div className='flex flex-wrap items-center gap-2'>
                    {selectedToken.isActive ? (
                      <span className='inline-flex items-center gap-1 text-[11px] font-bold text-[var(--hn-good)] bg-[var(--hn-good-soft)] px-2 py-0.5 rounded-full'>{t('my_api_tokens.active')}</span>
                    ) : (
                      <span className='inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>{t('my_api_tokens.inactive')}</span>
                    )}
                    {isExpired(selectedToken.expiresAt) && (
                      <span className='inline-flex items-center gap-1 text-[11px] font-bold text-[var(--hn-error)] bg-[var(--hn-error-soft)] px-2 py-0.5 rounded-full'>{t('my_api_tokens.expired')}</span>
                    )}
                  </div>
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div>
                    <Label className='mb-2 block'>{t('my_api_tokens.issued_date')}</Label>
                    <div className='px-3 py-2 border border-input rounded-md bg-muted text-foreground text-sm'>
                      {formatDate(selectedToken.createdAt)}
                    </div>
                  </div>
                  {selectedToken.expiresAt && (
                    <div>
                      <Label className='mb-2 block'>{t('my_api_tokens.expiry_date')}</Label>
                      <div className='px-3 py-2 border border-input rounded-md bg-muted text-foreground text-sm'>
                        {formatDate(selectedToken.expiresAt)}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className='mb-2 block'>{t('my_api_tokens.usage')}</Label>
                  <div className='px-3 py-2 border border-input rounded-md bg-muted text-foreground text-sm'>
                    <div className='flex flex-wrap items-center gap-4'>
                      <span>
                        {t('my_api_tokens.requests')}:{' '}
                        <strong>
                          {t('my_api_tokens.request_count', { count: selectedToken.usage?.requestCount || 0 })}
                        </strong>
                      </span>
                      <span>
                        {t('my_api_tokens.tokens_unit')}:{' '}
                        <strong>
                          {selectedToken.usage?.totalTokens
                            ? `${(
                                selectedToken.usage.totalTokens / 1000
                              ).toFixed(1)}K`
                            : '0'}
                        </strong>
                      </span>
                    </div>
                    {selectedToken.usage?.lastUsed && (
                      <div className='mt-2 text-xs text-muted-foreground'>
                        {t('my_api_tokens.last_used')}: {formatDate(selectedToken.usage.lastUsed)}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className='flex items-center justify-between mb-2'>
                    <Label>{t('my_api_tokens.usage_example')}</Label>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        const curlExample = apiCurlExample.trim()
                          ? replacePlaceholders(apiCurlExample, '{{KEY}}')
                          : getDefaultCurlExample('{{KEY}}');
                        copyToClipboard(curlExample, 'tokenInfoCurl');
                      }}
                    >
                      {copiedStates.tokenInfoCurl ? (
                        <Check className='h-3 w-3 text-primary' />
                      ) : (
                        <Copy className='h-3 w-3' />
                      )}
                      {t('my_api_tokens.copy_example')}
                    </Button>
                  </div>
                  <div className='bg-muted rounded-lg p-4 border border-border'>
                    <pre className='text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap'>
                      {apiCurlExample.trim()
                        ? replacePlaceholders(apiCurlExample, '{{KEY}}')
                        : getDefaultCurlExample('{{KEY}}')}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={() => {
                  setShowTokenInfoModal(false);
                  setSelectedToken(null);
                }}
              >
                {t('my_api_tokens.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* OpenAI 호환 프록시 API 안내 섹션 */}
        <div className='mt-6 sm:mt-8'>
          <Card className='py-0 gap-0'>
            <CardContent className='p-4 sm:p-5'>
              <div className='mb-4'>
                <div className='flex items-center justify-between mb-2'>
                  <h2 className='text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2'>
                    <Zap className='h-5 w-5 sm:h-6 sm:w-6 text-primary' />
                    {t('my_api_tokens.openai_proxy_api')}
                  </h2>
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={() =>
                      setIsApiSectionExpanded(!isApiSectionExpanded)
                    }
                    aria-label={isApiSectionExpanded ? t('my_api_tokens.collapse') : t('my_api_tokens.expand')}
                  >
                    {isApiSectionExpanded ? (
                      <ChevronUp className='h-5 w-5' />
                    ) : (
                      <ChevronDown className='h-5 w-5' />
                    )}
                  </Button>
                </div>
                <p className='text-sm sm:text-base text-muted-foreground'>
                  {t('my_api_tokens.openai_proxy_description')}
                </p>
              </div>

              {isApiSectionExpanded && (
                <div className='space-y-4'>
                  <div className='border-2 border-primary/30 rounded-lg p-4 sm:p-5'>
                    <div className='flex items-start gap-3 mb-4'>
                      <div className='flex-shrink-0'>
                        <Zap className='h-6 w-6 text-primary' />
                      </div>
                      <div className='flex-1'>
                        <h3 className='text-lg font-semibold text-primary mb-1'>
                          {t('my_api_tokens.unified_api')}
                        </h3>
                        <p className='text-sm text-muted-foreground'>
                          {t('my_api_tokens.openai_api_compatible_format')}
                        </p>
                      </div>
                    </div>

                    <div className='bg-primary/5 p-3 rounded-lg mb-4'>
                      <h4 className='font-semibold text-primary mb-2 text-sm'>
                        {t('my_api_tokens.key_features')}
                      </h4>
                      <ul className='text-sm text-primary/80 space-y-1.5'>
                        <li className='flex items-start gap-2'>
                          <span className='text-primary mt-0.5'>🎯</span>
                          <span>
                            {t('my_api_tokens.feature_standard_compatible')}
                          </span>
                        </li>
                        <li className='flex items-start gap-2'>
                          <span className='text-primary mt-0.5'>🔗</span>
                          <span>
                            {t('my_api_tokens.feature_compatibility')}
                          </span>
                        </li>
                      </ul>
                    </div>

                    <div className='space-y-3'>
                      <div>
                        <Label className='mb-2 block'>
                    {t('my_api_tokens.select_api_key')} <span className='text-destructive'>*</span>
                        </Label>
                        <select
                          value={selectedApiTokenId}
                          onChange={(e) => {
                            setSelectedApiTokenId(e.target.value);
                          }}
                          className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm mb-2'
                        >
                      <option value=''>{t('my_api_tokens.select_key')}</option>
                          {tokens
                            .filter(
                              (token) =>
                                token.isActive && !isExpired(token.expiresAt)
                            )
                            .map((token) => (
                              <option key={token._id} value={token._id}>
                                {token.name || t('my_api_tokens.unnamed')}
                              </option>
                            ))}
                        </select>
                        <p className='text-xs text-muted-foreground mt-1'>
                        {t('my_api_tokens.select_key_description')}
                        </p>
                        {selectedApiTokenId && (
                          <p className='text-xs text-muted-foreground mt-1'>
                            {t('my_api_tokens.one_time_display_note')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className='border border-border rounded-lg p-4 sm:p-5'>
                    <div className='flex items-start gap-3 mb-4'>
                      <div className='flex-shrink-0'>
                        <ExternalLink className='h-5 w-5 text-primary' />
                      </div>
                      <div className='flex-1'>
                        <h3 className='text-lg font-semibold text-foreground mb-1'>
                          {t('my_api_tokens.vscode_continue_settings')}
                        </h3>
                      </div>
                    </div>

                    <div className='bg-[var(--hn-warn-soft)] border-l-4 border-[var(--hn-warn)] rounded-lg p-3 mb-4'>
                      <div className='flex items-start gap-2'>
                        <AlertCircle className='h-5 w-5 text-[var(--hn-warn)] flex-shrink-0 mt-0.5' />
                        <p className='text-sm text-foreground'>
                          {t('my_api_tokens.vscode_warning')}
                        </p>
                      </div>
                    </div>

                    <div className='space-y-3'>
                      <div className='flex items-center justify-between'>
                        <h4 className='font-semibold text-foreground text-sm'>
                          {t('my_api_tokens.config_example_title')}
                        </h4>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            const configText = buildConfigPresetText();
                            copyToClipboard(configText, 'config');
                          }}
                        >
                          {copiedStates.config ? (
                            <Check className='h-4 w-4 text-primary' />
                          ) : (
                            <Copy className='h-4 w-4' />
                          )}
                          {t('my_api_tokens.copy_example')}
                        </Button>
                      </div>

                      <div className='bg-muted p-4 rounded-lg border border-border overflow-x-auto'>
                        <pre className='text-xs font-mono text-foreground whitespace-pre-wrap'>
                          {buildConfigPresetText()}
                        </pre>
                      </div>
                    </div>
                  </div>

                  <div className='border border-border rounded-lg p-4 sm:p-5'>
                    <div className='flex items-center gap-2 mb-2'>
                      <h3 className='text-lg font-semibold text-foreground'>
                        {t('my_api_tokens.api_test_curl')}
                      </h3>
                      <Badge variant='secondary'>Windows</Badge>
                    </div>
                    <p className='text-sm text-muted-foreground mb-3'>
                        {t('my_api_tokens.api_key_required_message')}
                    </p>

                    <div className='bg-[var(--hn-warn-soft)] border-l-4 border-[var(--hn-warn)] rounded-lg p-3 mb-4'>
                      <div className='flex items-start gap-2'>
                        <AlertCircle className='h-5 w-5 text-[var(--hn-warn)] flex-shrink-0 mt-0.5' />
                        <p className='text-sm text-foreground'>
                          {t('my_api_tokens.api_auth_warning')}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div>
                        <div className='flex items-center justify-between mb-2'>
                          <h5 className='font-medium text-foreground text-sm'>
                            {t('my_api_tokens.chat_completions_test')}
                          </h5>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => {
                              const curlText = buildCurlExampleText();
                              copyToClipboard(curlText, 'curlTest');
                            }}
                          >
                            {copiedStates.curlTest ? (
                              <Check className='h-3 w-3 text-primary' />
                            ) : (
                              <Copy className='h-3 w-3' />
                            )}
                            {t('my_api_tokens.copy')}
                          </Button>
                        </div>
                        <div className='bg-muted text-foreground p-3 rounded-lg border border-border text-xs font-mono overflow-x-auto'>
                          <pre className='whitespace-pre-wrap'>{buildCurlExampleText()}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, title: '', message: '', type: 'error' })}
        title={errorModal.title}
        message={errorModal.message}
        type={errorModal.type}
        confirmText={t('my_api_tokens.confirm')}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ 
          isOpen: false, 
          title: '', 
          message: '', 
          type: 'warning', 
          onConfirm: null,
          confirmText: t('my_api_tokens.confirm'),
          cancelText: t('my_api_tokens.cancel')
        })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText || t('my_api_tokens.confirm')}
        cancelText={confirmModal.cancelText || t('my_api_tokens.cancel')}
      />
    </div>
  );
}
