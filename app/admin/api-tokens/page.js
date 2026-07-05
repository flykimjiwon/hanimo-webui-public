'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Eye,
  RefreshCw,
  User,
  Calendar,
  Zap,
  AlertCircle,
  X,
  Filter,
  Power,
  PowerOff,
} from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const TOKENS_PER_PAGE = 20;
const DEFAULT_EXPIRES_IN_DAYS = 90;
const MAX_EXPIRES_IN_DAYS = 365;
const MIN_EXPIRES_IN_DAYS = 1;

// 유틸 함수들
const formatDate = (dateValue) => {
  if (!dateValue) return '-';
  
  let date;
  if (dateValue instanceof Date) {
    date = dateValue;
  } else if (typeof dateValue === 'string') {
    if (dateValue.trim() === '') return '-';
    date = new Date(dateValue);
  } else if (typeof dateValue === 'number') {
    date = new Date(dateValue);
  } else {
    return '-';
  }
  
  if (isNaN(date.getTime())) {
    if (typeof dateValue === 'string') {
      logger.warn('Invalid date value:', dateValue);
    }
    return '-';
  }
  
  return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
};

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  
  const expiryDate = expiresAt instanceof Date 
    ? expiresAt 
    : new Date(expiresAt);
  
  return !isNaN(expiryDate.getTime()) && expiryDate < new Date();
};

const filterTokens = (tokens, searchTerm) => {
  if (!searchTerm) return tokens;
  
  const searchLower = searchTerm.toLowerCase();
  return tokens.filter((token) =>
    token.name?.toLowerCase().includes(searchLower) ||
    token.user?.email?.toLowerCase().includes(searchLower) ||
    token.user?.name?.toLowerCase().includes(searchLower) ||
    token.tokenHash?.toLowerCase().includes(searchLower)
  );
};

const formatTokenCount = (count) => {
  if (!count) return '0';
  return `${(count / 1000).toFixed(1)}K`;
};

// API 호출 헬퍼
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const handleApiError = async (response, defaultMessage, alert, errorTitle) => {
  const errorData = await response.json().catch(() => ({}));
  const message = errorData.error || defaultMessage;
  alert(message, 'error', errorTitle);
  return errorData;
};

export default function ApiKeysPage() {
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const { isReadOnly } = useAdminAuth();
  const [tokens, setTokens] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(DEFAULT_EXPIRES_IN_DAYS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showTokenInfoModal, setShowTokenInfoModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users?limit=1000', {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      logger.error(t('admin_api_tokens.fetch_users_error'), error);
    }
  }, [t]);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: TOKENS_PER_PAGE.toString(),
        ...(selectedUserFilter && { userId: selectedUserFilter }),
      });

      const response = await fetch(`/api/admin/api-keys?${params}`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setTokens(data.data.tokens || []);
        setTotalPages(data.data.pagination.totalPages);
        setTotalCount(data.data.pagination.totalCount);
      } else {
        await handleApiError(
          response,
          t('admin_api_tokens.fetch_tokens_error', { status: response.status }),
          alert,
          t('admin_api_tokens.error')
        );
      }
    } catch (error) {
      logger.error(t('admin_api_tokens.fetch_tokens_console_error'), error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedUserFilter, alert, t]);

  const createToken = useCallback(async () => {
    if (!selectedUserId) {
      alert(t('admin_api_tokens.select_user_required'), 'warning', t('admin_api_tokens.select_error'));
      return;
    }

    try {
      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: selectedUserId,
          name: tokenName || undefined,
          expiresInDays: parseInt(expiresInDays),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewToken(data.data.token);
        setShowCreateModal(false);
        setShowTokenModal(true);
        setTokenName('');
        setSelectedUserId('');
        fetchTokens();
      } else {
        await handleApiError(response, t('admin_api_tokens.create_failed'), alert, t('admin_api_tokens.error'));
      }
    } catch (error) {
      logger.error(t('admin_api_tokens.create_console_error'), error);
      alert(t('admin_api_tokens.create_error'), 'error', t('admin_api_tokens.error'));
    }
  }, [selectedUserId, tokenName, expiresInDays, alert, fetchTokens, t]);

  const deleteToken = useCallback(async (tokenId) => {
    const confirmed = await confirm(t('admin_api_tokens.delete_confirm'), t('admin_api_tokens.delete_confirm_title'));
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/api-keys?id=${tokenId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        alert(t('admin_api_tokens.deleted'), 'success', t('admin_api_tokens.delete_complete'));
        fetchTokens();
      } else {
        await handleApiError(response, t('admin_api_tokens.delete_failed'), alert, t('admin_api_tokens.error'));
      }
    } catch (error) {
      logger.error(t('admin_api_tokens.delete_console_error'), error);
      alert(t('admin_api_tokens.delete_error'), 'error', t('admin_api_tokens.error'));
    }
  }, [confirm, alert, fetchTokens, t]);

  const toggleTokenStatus = useCallback(async (tokenId, currentStatus) => {
    try {
      const response = await fetch('/api/admin/api-keys', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: tokenId,
          isActive: !currentStatus,
        }),
      });

      if (response.ok) {
        fetchTokens();
      } else {
        await handleApiError(response, t('admin_api_tokens.toggle_status_failed'), alert, t('admin_api_tokens.error'));
      }
    } catch (error) {
      logger.error(t('admin_api_tokens.toggle_console_error'), error);
      alert(t('admin_api_tokens.toggle_error'), 'error', t('admin_api_tokens.error'));
    }
  }, [alert, fetchTokens, t]);

  const copyToken = useCallback(async (token) => {
    try {
      await navigator.clipboard.writeText(token);
      alert(t('admin_api_tokens.copied'), 'success');
    } catch (error) {
      logger.error(t('admin_api_tokens.copy_console_error'), error);
      alert(t('admin_api_tokens.copy_failed'), 'error');
    }
  }, [alert, t]);

  const resetCreateForm = useCallback(() => {
    setShowCreateModal(false);
    setTokenName('');
    setSelectedUserId('');
    setExpiresInDays(DEFAULT_EXPIRES_IN_DAYS);
  }, []);

  const handleUserFilterChange = useCallback((value) => {
    setSelectedUserFilter(value);
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const filteredTokens = useMemo(
    () => filterTokens(tokens, searchTerm),
    [tokens, searchTerm]
  );

  // 서브 컴포넌트들
  const ModalOverlay = ({ onClose, children, maxWidth = 'md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl' }) => (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div
        className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
        onClick={onClose}
      />
      <div className={`relative bg-card rounded-lg w-full max-w-full ${maxWidth} p-6`}>
        {children}
      </div>
    </div>
  );

  const ModalHeader = ({ title, icon: Icon, iconClassName, onClose }) => (
    <div className='flex items-center justify-between mb-4'>
      {Icon ? (
        <div className='flex items-center gap-2'>
          <Icon className={iconClassName || 'h-5 w-5 text-muted-foreground'} />
          <h3 className='text-lg font-medium text-foreground'>{title}</h3>
        </div>
      ) : (
        <h3 className='text-lg font-medium text-foreground'>{title}</h3>
      )}
      <button
        onClick={onClose}
        className='text-muted-foreground hover:text-foreground'
      >
        <X className='h-5 w-5' />
      </button>
    </div>
  );

  const TokenItem = ({ token, onView, onToggleStatus, onDelete }) => (
    <div className='border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors'>
      <div className='flex items-start justify-between'>
        <div className='flex-1'>
          <div className='flex items-center gap-3 mb-2'>
            <Key className='h-5 w-5 text-muted-foreground' />
            <div>
              <div className='flex items-center gap-2'>
                <span className='font-medium text-foreground'>
                  {token.name || t('admin_api_tokens.no_name')}
                </span>
                {token.isActive ? (
                  <span className='px-2 py-0.5 bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary rounded text-xs font-medium'>
                    {t('admin_api_tokens.active')}
                  </span>
                ) : (
                  <span className='px-2 py-0.5 bg-muted text-foreground dark:bg-muted dark:text-muted-foreground rounded text-xs font-medium'>
                    {t('admin_api_tokens.inactive')}
                  </span>
                )}
                {isExpired(token.expiresAt) && (
                  <span className='px-2 py-0.5 bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive rounded text-xs font-medium'>
                    {t('admin_api_tokens.expired')}
                  </span>
                )}
              </div>
              <div className='text-sm text-muted-foreground mt-2 space-y-1'>
                {token.user && (
                  <div className='flex items-center gap-1'>
                    <User className='h-4 w-4' />
                    <span>
                      {token.user.name} ({token.user.email})
                    </span>
                  </div>
                )}
                <div className='flex items-center gap-4'>
                  <div className='flex items-center gap-1'>
                    <Calendar className='h-4 w-4' />
                    <span>{t('admin_api_tokens.issued', { date: formatDate(token.createdAt) })}</span>
                  </div>
                  {token.expiresAt && (
                    <div className='flex items-center gap-1'>
                      <Calendar className='h-4 w-4' />
                      <span>{t('admin_api_tokens.expires', { date: formatDate(token.expiresAt) })}</span>
                    </div>
                  )}
                </div>
                <div className='flex items-center gap-4'>
                  <div className='flex items-center gap-1'>
                    <Zap className='h-4 w-4' />
                    <span>
                      {t('admin_api_tokens.usage', { count: token.usage?.requestCount || 0, tokens: formatTokenCount(token.usage?.totalTokens) })}
                    </span>
                  </div>
                  {token.usage?.lastUsed && (
                    <div className='text-xs text-muted-foreground'>
                      {t('admin_api_tokens.last_used', { date: formatDate(token.usage.lastUsed) })}
                    </div>
                  )}
                </div>
                <div className='text-xs text-muted-foreground font-mono'>
                  {t('admin_api_tokens.hash', { hash: token.tokenHash })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={() => onView(token)}
            className='p-2 text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground hover:bg-accent rounded transition-colors'
            title={t('admin_api_tokens.view_info')}
          >
            <Eye className='h-4 w-4' />
          </button>
          <button
            onClick={() => onToggleStatus(token._id, token.isActive)}
            className={`p-2 rounded transition-colors ${
              token.isActive
                ? 'text-primary hover:text-primary dark:text-primary dark:hover:text-primary hover:bg-primary/10'
                : 'text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground hover:bg-accent'
            }`}
            title={token.isActive ? t('admin_api_tokens.deactivate') : t('admin_api_tokens.activate')}
          >
            {token.isActive ? (
              <Power className='h-4 w-4' />
            ) : (
              <PowerOff className='h-4 w-4' />
            )}
          </button>
          <button
            onClick={() => onDelete(token._id)}
            className='p-2 text-destructive hover:text-destructive dark:hover:text-destructive hover:bg-destructive/10 rounded transition-colors'
            title={t('admin_api_tokens.delete')}
          >
            <Trash2 className='h-4 w-4' />
          </button>
        </div>
      </div>
    </div>
  );

  const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    return (
      <div className='flex items-center justify-between mt-6'>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className='px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent'
        >
          {t('common.previous')}
        </button>
        <span className='text-sm text-muted-foreground'>
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className='px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent'
        >
          {t('common.next')}
        </button>
      </div>
    );
  };

  // 페이지 로드 시 초기화
  useEffect(() => {
    fetchUsers();
    fetchTokens();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 페이지 변경 시 키 목록 갱신
  useEffect(() => {
    fetchTokens();
  }, [currentPage, selectedUserFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className='space-y-6'>
      <PageHead
        eyebrow='API'
        title={t('admin_api_tokens.title')}
        sub={t('admin_api_tokens.subtitle')}
        actions={
          <>
            <button
              onClick={fetchTokens}
              disabled={loading}
              className='inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none gap-2'
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('admin_api_tokens.refresh')}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none gap-2'
            >
              <Plus className='h-4 w-4' />
              {t('admin_api_tokens.create')}
            </button>
          </>
        }
      />

      {/* 필터 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-4'>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-2'>
            <Filter className='h-5 w-5 text-muted-foreground' />
            <span className='text-sm font-medium text-foreground'>
              {t('admin_api_tokens.filter')}
            </span>
          </div>
          <div className='flex-1'>
            <input
              type='text'
              placeholder={t('admin_api_tokens.search_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
            />
          </div>
          <div className='w-64'>
            <select
              value={selectedUserFilter}
              onChange={(e) => handleUserFilterChange(e.target.value)}
              className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
            >
              <option value=''>{t('admin_api_tokens.all_users')}</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 키 목록 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='font-medium text-foreground'>
            {t('admin_api_tokens.token_list', { count: totalCount.toLocaleString() })}
          </h3>
        </div>

        {loading ? (
          <div className='flex items-center justify-center py-8'>
            <RefreshCw className='h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className='text-center py-8 text-muted-foreground'>
            {t('admin_api_tokens.no_tokens')}
          </div>
        ) : (
          <div className='space-y-3'>
            {filteredTokens.map((token) => (
              <TokenItem
                key={token._id}
                token={token}
                onView={(token) => {
                  setSelectedToken(token);
                  setShowTokenInfoModal(true);
                }}
                onToggleStatus={toggleTokenStatus}
                onDelete={deleteToken}
              />
            ))}
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* 키 발급 모달 */}
      {showCreateModal && (
        <ModalOverlay onClose={resetCreateForm}>
          <ModalHeader title={t('admin_api_tokens.create_title')} onClose={resetCreateForm} />
          <div className='space-y-4'>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.select_user')}
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
              >
                <option value=''>{t('admin_api_tokens.select_user_placeholder')}</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.token_name')}
              </label>
              <input
                type='text'
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder={t('admin_api_tokens.token_name_placeholder')}
                className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.expires_days')}
              </label>
              <input
                type='number'
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                min={MIN_EXPIRES_IN_DAYS}
                max={MAX_EXPIRES_IN_DAYS}
                className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
              />
            </div>
          </div>
          <div className='flex items-center gap-2 mt-6'>
            <button
              onClick={resetCreateForm}
              className='flex-1 px-4 py-2 border border-border rounded-md bg-background text-foreground hover:bg-accent'
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={createToken}
              className='flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90'
            >
              {t('admin_api_tokens.issue')}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* 발급된 키 표시 모달 */}
      {showTokenModal && newToken && (
        <ModalOverlay
          onClose={() => {
            setShowTokenModal(false);
            setNewToken(null);
          }}
          maxWidth='md:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl'
        >
          <ModalHeader
            title={t('admin_api_tokens.issued_title')}
            icon={AlertCircle}
            iconClassName='h-5 w-5 text-muted-foreground'
            onClose={() => {
              setShowTokenModal(false);
              setNewToken(null);
            }}
          />
          <div className='bg-muted border border-border rounded-lg p-4 mb-4'>
            <p className='text-sm text-muted-foreground'>
              {t('admin_api_tokens.issued_warning')}
            </p>
          </div>
          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_api_tokens.api_key_label')}
            </label>
            <div className='flex items-center gap-2'>
              <input
                type='text'
                value={newToken}
                readOnly
                className='flex-1 px-3 py-2 border border-border rounded-md bg-muted text-foreground font-mono text-sm'
              />
              <button
                onClick={() => copyToken(newToken)}
                className='px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 flex items-center gap-2'
              >
                <Copy className='h-4 w-4' />
                {t('admin_api_tokens.copy')}
              </button>
            </div>
          </div>
          <div className='mt-4'>
            <p className='text-sm text-muted-foreground'>
              {t('admin_api_tokens.usage_hint')}
            </p>
          </div>
          <div className='mt-6'>
            <button
              onClick={() => {
                setShowTokenModal(false);
                setNewToken(null);
              }}
              className='w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90'
            >
              {t('common.confirm')}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* 키 정보 보기 모달 */}
      {showTokenInfoModal && selectedToken && (
        <ModalOverlay
          onClose={() => {
            setShowTokenInfoModal(false);
            setSelectedToken(null);
          }}
          maxWidth='md:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl'
        >
          <ModalHeader
            title={t('admin_api_tokens.info_title')}
            icon={Key}
            onClose={() => {
              setShowTokenInfoModal(false);
              setSelectedToken(null);
            }}
          />
          <div className='space-y-4'>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.key_name')}
              </label>
              <div className='px-3 py-2 border border-border rounded-md bg-muted text-foreground'>
                {selectedToken.name || t('admin_api_tokens.no_name')}
              </div>
            </div>
            {selectedToken.user && (
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('admin_api_tokens.user')}
                </label>
                <div className='px-3 py-2 border border-border rounded-md bg-muted text-foreground'>
                  {selectedToken.user.name} ({selectedToken.user.email})
                </div>
              </div>
            )}
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.original_key')}
              </label>
              <div className='px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground text-sm'>
                {t('admin_api_tokens.original_key_unavailable')}
              </div>
            </div>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.key_hash')}
              </label>
              <div className='flex items-center gap-2'>
                <input
                  type='text'
                  value={selectedToken.tokenHash}
                  readOnly
                  className='flex-1 px-3 py-2 border border-border rounded-md bg-muted text-foreground font-mono text-sm'
                />
                <button
                  onClick={() => copyToken(selectedToken.tokenHash)}
                  className='px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 flex items-center gap-2'
                >
                  <Copy className='h-4 w-4' />
                  {t('admin_api_tokens.copy')}
                </button>
              </div>
            </div>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.status')}
              </label>
              <div className='flex items-center gap-2'>
                {selectedToken.isActive ? (
                  <span className='px-2 py-1 bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary rounded text-sm font-medium'>
                    {t('admin_api_tokens.active')}
                  </span>
                ) : (
                  <span className='px-2 py-1 bg-muted text-foreground dark:bg-muted dark:text-muted-foreground rounded text-sm font-medium'>
                    {t('admin_api_tokens.inactive')}
                  </span>
                )}
                {isExpired(selectedToken.expiresAt) && (
                  <span className='px-2 py-1 bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive rounded text-sm font-medium'>
                    {t('admin_api_tokens.expired')}
                  </span>
                )}
              </div>
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('admin_api_tokens.issue_date')}
                </label>
                <div className='px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm'>
                  {formatDate(selectedToken.createdAt)}
                </div>
              </div>
              {selectedToken.expiresAt && (
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1'>
                    {t('admin_api_tokens.expiry_date')}
                  </label>
                  <div className='px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm'>
                    {formatDate(selectedToken.expiresAt)}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.usage_label')}
              </label>
              <div className='px-3 py-2 border border-border rounded-md bg-muted text-foreground text-sm'>
                <div className='flex items-center gap-4'>
                  <span>{t('admin_api_tokens.request_count', { count: selectedToken.usage?.requestCount || 0 })}</span>
                  <span>{t('admin_api_tokens.token_count', { count: formatTokenCount(selectedToken.usage?.totalTokens) })}</span>
                </div>
                {selectedToken.usage?.lastUsed && (
                  <div className='mt-2 text-xs text-muted-foreground'>
                    {t('admin_api_tokens.last_used', { date: formatDate(selectedToken.usage.lastUsed) })}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_api_tokens.usage_example')}
              </label>
              <div className='px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground text-sm'>
                {t('admin_api_tokens.usage_hint')}
              </div>
            </div>
          </div>
          <div className='mt-6 flex justify-end'>
            <button
              onClick={() => {
                setShowTokenInfoModal(false);
                setSelectedToken(null);
              }}
              className='px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90'
            >
              {t('common.confirm')}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
