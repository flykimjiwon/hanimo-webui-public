'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Search,
  Mail,
  MailOpen,
  Trash2,
  Eye,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  XCircle,
  Clock,
  User,
  Plus,
} from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import SendMessageModal from './components/SendMessageModal';
import { useTranslation } from '@/hooks/useTranslation';

export default function DirectMessagesPage() {
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('');
  const [isReadFilter, setIsReadFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);

  // 쪽지 목록 조회
  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: currentPage.toString(),
        search: searchTerm,
        recipient: recipientFilter,
        isRead: isReadFilter,
      });

      const response = await fetch(`/api/admin/direct-messages?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('admin_dm.fetch_error'));
      }
      setMessages(data.messages);
      setTotalPages(data.pagination.totalPages);
      setTotalCount(data.pagination.totalCount);
    } catch (error) {
      logger.error(t('admin_dm.fetch_error'), error);
      alert(t('admin_dm.fetch_failed'), 'error', t('admin_dm.fetch_error_title'));
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, recipientFilter, isReadFilter, alert, t]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 필터 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, recipientFilter, isReadFilter]);

  // 쪽지 삭제
  const deleteMessage = async (messageId) => {
    const confirmed = await confirm(
      t('admin_dm.delete_confirm'),
      t('admin_dm.delete_confirm_title')
    );
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/direct-messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(t('admin_dm.delete_error'));
      }

      fetchMessages();
      alert(t('admin_dm.deleted'), 'success', t('admin_dm.delete_complete'));
    } catch (error) {
      logger.error(t('admin_dm.delete_error'), error);
      alert(t('admin_dm.delete_failed'), 'error', t('admin_dm.delete_failed_title'));
    }
  };

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

  const truncateText = (text, maxLength = 50) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  // 활성 필터 개수 계산
  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (recipientFilter) count++;
    if (isReadFilter) count++;
    return count;
  };

  // 모든 필터 초기화
  const clearAllFilters = () => {
    setSearchTerm('');
    setRecipientFilter('');
    setIsReadFilter('');
  };

  const handleSendSuccess = (message) => {
    alert(message, 'success', t('admin_dm.send_complete'));
    fetchMessages();
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="bg-muted rounded-lg p-6 border border-border">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex-1">
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
              쪽지 관리
            </div>
            <h1
              className="font-bold flex items-center gap-3"
              style={{
                fontSize: 'clamp(22px, 2.6vw, 28px)',
                letterSpacing: '-0.02em',
                color: 'var(--hn-fg)',
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {t('admin_dm.title')}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {t('admin_dm.subtitle')}
            </p>

            {/* 통계 요약 */}
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg shadow-sm">
                <Mail className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  {t('admin_dm.total_sent')}
                </span>
                <span className="text-lg font-bold text-foreground">
                  {totalCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* 액션 버튼 그룹 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fetchMessages()}
              disabled={loading}
              className="inline-flex items-center px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-muted text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
              />
              {t('admin_dm.refresh')}
            </button>
            <button
              onClick={() => setShowSendModal(true)}
              className="inline-flex items-center px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('admin_dm.new_message')}
            </button>
          </div>
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {/* 필터 헤더 */}
        <div className="bg-muted px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Filter className="h-5 w-5 text-foreground" />
              <h3 className="text-lg font-semibold text-foreground">
                {t('admin_dm.filter_search')}
              </h3>
              {getActiveFiltersCount() > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {t('admin_dm.active_filters', { count: getActiveFiltersCount() })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {getActiveFiltersCount() > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('admin_dm.clear_all')}
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                {showFilters ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    {t('admin_dm.hide')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    {t('admin_dm.expand')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 필터 콘텐츠 */}
        {showFilters && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 검색 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Search className="inline h-4 w-4 mr-1" />
                  {t('admin_dm.search_title_content')}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <input
                    type="text"
                    placeholder={t('admin_dm.search_placeholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all"
                  />
                </div>
              </div>

              {/* 수신자 검색 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <User className="inline h-4 w-4 mr-1" />
                  {t('admin_dm.recipient_search')}
                </label>
                <input
                  type="text"
                  placeholder={t('admin_dm.recipient_placeholder')}
                  value={recipientFilter}
                  onChange={(e) => setRecipientFilter(e.target.value)}
                  className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all"
                />
              </div>

              {/* 읽음 상태 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <MailOpen className="inline h-4 w-4 mr-1" />
                  {t('admin_dm.read_status')}
                </label>
                <select
                  value={isReadFilter}
                  onChange={(e) => setIsReadFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all"
                >
                  <option value="">{t('admin_dm.all')}</option>
                  <option value="true">{t('admin_dm.read')}</option>
                  <option value="false">{t('admin_dm.unread')}</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 쪽지 목록 */}
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">
              {t('admin_dm.loading')}
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('admin_dm.no_messages')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('admin_dm.no_messages_hint')}
            </p>
            <button
              onClick={() => setShowSendModal(true)}
              className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('admin_dm.new_message')}
            </button>
          </div>
        ) : (
          <>
            {/* 테이블 헤더 */}
            <div className="bg-muted px-6 py-4 border-b-2 border-border">
              <div className="grid grid-cols-12 gap-4 text-xs font-bold text-foreground uppercase tracking-wider">
                <div className="col-span-2 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {t('admin_dm.col_recipient')}
                </div>
                <div className="col-span-3 flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {t('admin_dm.col_title')}
                </div>
                <div className="col-span-3">{t('admin_dm.col_content')}</div>
                <div className="col-span-1 flex items-center gap-1">
                  <MailOpen className="h-3.5 w-3.5" />
                  {t('admin_dm.col_status')}
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {t('admin_dm.col_sent_at')}
                </div>
                <div className="col-span-1 text-center">{t('admin_dm.col_actions')}</div>
              </div>
            </div>

            {/* 쪽지 목록 */}
            <div className="max-h-[70vh] overflow-y-auto">
              <div className="divide-y divide-border">
                {messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`px-6 py-4 transition-all duration-150 ${
                      index % 2 === 0
                        ? 'bg-card'
                        : 'bg-muted/50'
                    } hover:bg-accent hover:shadow-sm`}
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* 수신자 */}
                      <div className="col-span-2">
                        <div className="text-sm">
                          <p className="font-semibold text-foreground truncate">
                            {message.recipient?.name || t('admin_dm.no_name')}
                          </p>
                          <p className="text-muted-foreground text-xs truncate">
                            {message.recipient?.email}
                          </p>
                          {message.recipient?.department && (
                            <p className="text-muted-foreground text-xs truncate">
                              {message.recipient.department}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 제목 */}
                      <div className="col-span-3">
                        <p className="text-sm font-medium text-foreground truncate">
                          {message.title}
                        </p>
                      </div>

                      {/* 내용 */}
                      <div className="col-span-3">
                        <p className="text-sm text-muted-foreground truncate">
                          {truncateText(message.content, 60)}
                        </p>
                      </div>

                      {/* 상태 */}
                      <div className="col-span-1">
                        {message.deletedByRecipient ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            {t('admin_dm.status_deleted')}
                          </span>
                        ) : message.isRead ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            <MailOpen className="h-3 w-3 mr-1" />
                            {t('admin_dm.status_read')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            <Mail className="h-3 w-3 mr-1" />
                            {t('admin_dm.status_unread')}
                          </span>
                        )}
                      </div>

                      {/* 발송일시 */}
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(message.createdAt)}
                        </p>
                        {message.readAt && (
                          <p className="text-xs text-primary mt-1">
                            {t('admin_dm.read_at', { date: formatDate(message.readAt) })}
                          </p>
                        )}
                      </div>

                      {/* 작업 */}
                      <div className="col-span-1">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedMessage(message)}
                            className="p-2 text-primary hover:text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-all"
                            title={t('admin_dm.detail_view')}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteMessage(message.id)}
                            className="p-2 text-destructive hover:text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-all"
                            title={t('admin_dm.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {((currentPage - 1) * 20 + 1).toLocaleString()}
              </span>
              {' - '}
              <span className="font-medium text-foreground">
                {Math.min(currentPage * 20, totalCount).toLocaleString()}
              </span>
              {' / '}
              <span className="font-medium text-foreground">
                {totalCount.toLocaleString()}
              </span>
              {' '}{t('admin_dm.count_messages')}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ««
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('admin_dm.prev')}
              </button>

              <div className="flex items-center gap-1">
                {(() => {
                  const pageButtons = [];
                  const maxVisible = 5;
                  let startPage = Math.max(
                    1,
                    currentPage - Math.floor(maxVisible / 2)
                  );
                  let endPage = Math.min(
                    totalPages,
                    startPage + maxVisible - 1
                  );

                  if (endPage - startPage + 1 < maxVisible) {
                    startPage = Math.max(1, endPage - maxVisible + 1);
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pageButtons.push(
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`min-w-[40px] px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                          currentPage === i
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'text-foreground bg-card border border-border hover:bg-accent'
                        }`}
                      >
                        {i}
                      </button>
                    );
                  }
                  return pageButtons;
                })()}
              </div>

              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('admin_dm.next')}
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                »»
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 쪽지 상세 보기 모달 */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedMessage(null)}
          />
          <div className="relative bg-card rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">
                {t('admin_dm.detail_title')}
              </h3>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <div>
                 <label className="text-sm font-medium text-muted-foreground">
                  {t('admin_dm.label_recipient')}
                </label>
                 <p className="text-foreground">
                  {selectedMessage.recipient?.name} (
                  {selectedMessage.recipient?.email})
                </p>
              </div>
              <div>
                 <label className="text-sm font-medium text-muted-foreground">
                  {t('admin_dm.label_title')}
                </label>
                 <p className="text-foreground font-medium">
                  {selectedMessage.title}
                </p>
              </div>
              <div>
                 <label className="text-sm font-medium text-muted-foreground">
                  {t('admin_dm.label_content')}
                </label>
                 <div className="mt-1 p-4 bg-muted rounded-lg">
                   <p className="text-foreground whitespace-pre-wrap">
                    {selectedMessage.content}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="text-sm font-medium text-muted-foreground">
                    {t('admin_dm.label_sent_at')}
                  </label>
                   <p className="text-foreground text-sm">
                    {formatDate(selectedMessage.createdAt)}
                  </p>
                </div>
                <div>
                   <label className="text-sm font-medium text-muted-foreground">
                    {t('admin_dm.label_read_status')}
                  </label>
                   <p className="text-foreground text-sm">
                    {selectedMessage.isRead
                      ? t('admin_dm.read_with_date', { date: formatDate(selectedMessage.readAt) })
                      : t('admin_dm.unread')}
                  </p>
                </div>
              </div>
            </div>
             <div className="p-4 border-t border-border flex justify-end">
              <button
                onClick={() => setSelectedMessage(null)}
                 className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                {t('admin_dm.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 쪽지 보내기 모달 */}
      <SendMessageModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSuccess={handleSendSuccess}
      />
    </div>
  );
}
