'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  MessageCircle,
  Filter,
  Download,
  Eye,
  Trash2,
  User,
  Clock,
  Bot,
  Calendar,
  Building,
  X,
  RefreshCw,
  Pause,
  Play,
  ThumbsUp,
  ThumbsDown,
  Hash,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  XCircle,
  BarChart3,
} from '@/components/icons';
import dynamic from 'next/dynamic';
const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
  loading: () => <div className="animate-pulse h-4 bg-muted rounded w-3/4" />,
});
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

const DEFAULT_DEPTS = [
  '개발팀',
  '프로덕트팀',
  '마케팅팀',
  '재무팀',
  '운영팀',
  '기타',
];

export default function MessagesPage() {
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const { isReadOnly } = useAdminAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedUser, setSelectedUser] = useState(''); // 사용자(이름/이메일) 필터
  const [dateRange, setDateRange] = useState('7d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [messageViewMode, setMessageViewMode] = useState('markdown'); // 'markdown' or 'raw'
  const [hasMessageOverflow, setHasMessageOverflow] = useState(false);
  const messageContentRef = useRef(null);
  const [isPollingEnabled, setIsPollingEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'card'

  const dateRangeOptions = [
    { value: '1d', label: t('admin_messages.date_today') },
    { value: '7d', label: t('admin_messages.date_7days') },
    { value: '30d', label: t('admin_messages.date_30days') },
    { value: '90d', label: t('admin_messages.date_3months') },
    { value: '365d', label: t('admin_messages.date_1year') },
    { value: 'all', label: t('admin_messages.date_all') },
    { value: 'custom', label: t('admin_messages.date_custom') },
  ];

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/admin/departments', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { departments: [] }))
      .then(({ departments: rows = [] }) => {
        const seen = new Map();
        rows.forEach(({ department, auth_type }) => {
          seen.set(
          `${department}|${auth_type}`,
          auth_type === 'sso'
            ? `${department.replaceAll('부서', '그룹')}(SSO)`
            : `${department.replaceAll('부서', '그룹')}(일반)`
        );
        });
        DEFAULT_DEPTS.forEach((dept) => {
          if (!seen.has(`${dept}|local`)) seen.set(`${dept}|local`, `${dept}(일반)`);
        });
        setDepartments(
          Array.from(seen.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
        );
      })
      .catch(() => {
      setDepartments(
        DEFAULT_DEPTS.map((d) => ({
          value: `${d}|local`,
          label: `${d.replaceAll('부서', '그룹')}(일반)`,
        }))
      );
      });
  }, []);

  // 메시지 목록 조회
  const fetchMessages = useCallback(
    async (silentRefresh = false) => {
      try {
        if (!silentRefresh) {
          setLoading(true);
        }
        const token = localStorage.getItem('token');
        const [deptName, authType] = deptFilter ? deptFilter.split('|') : ['', ''];
        const params = new URLSearchParams({
          page: currentPage.toString(),
          search: searchTerm,
          department: deptName,
          model: selectedModel,
          role: selectedRole,
          dateRange: dateRange,
        });
        if (dateRange === 'custom') {
          if (customStartDate) params.append('startDate', customStartDate);
          if (customEndDate) params.append('endDate', customEndDate);
        }
        // 피드백 필터가 선택된 경우에만 파라미터 추가
        if (authType) params.set('authType', authType);
        if (selectedFeedback) {
          params.append('feedback', selectedFeedback);
        }
        // 채팅방 ID 필터가 입력된 경우에만 파라미터 추가
        if (selectedRoomId) {
          params.append('roomId', selectedRoomId);
        }
        // 사용자(이름/이메일) 필터가 입력된 경우에만 파라미터 추가
        if (selectedUser) {
          params.append('user', selectedUser);
        }

        const response = await fetch(`/api/admin/messages?${params}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('메시지 데이터 조회 실패');
        }

        const data = await response.json();
        setMessages(data.messages);
        setTotalPages(data.pagination.totalPages);
        setTotalCount(data.pagination.totalCount);
        setLastRefresh(new Date());
      } catch (error) {
        logger.error('메시지 조회 실패:', error);
        if (!silentRefresh) {
          alert(
            t('admin_messages.fetch_messages_failed'),
            'error',
            t('admin_messages.fetch_failed_title')
          );
        }
      } finally {
        if (!silentRefresh) {
          setLoading(false);
        }
      }
    },
    [
      currentPage,
      searchTerm,
      deptFilter,
      selectedModel,
      selectedRole,
      selectedFeedback,
      selectedRoomId,
      selectedUser,
      dateRange,
      customStartDate,
      customEndDate,
      alert,
      setLoading,
      setMessages,
      setTotalPages,
      setTotalCount,
      setLastRefresh,
      t,
    ]
  );

  // 메시지 삭제
  const deleteMessage = async (messageId) => {
    const confirmed = await confirm(
      t('admin_messages.delete_confirm'),
      t('admin_messages.delete_confirm_title')
    );
    if (!confirmed) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('메시지 삭제 실패');
      }

      fetchMessages();
      alert(t('admin_messages.delete_success'), 'success', t('admin_messages.delete_success_title'));
    } catch (error) {
      logger.error('메시지 삭제 실패:', error);
      alert(t('admin_messages.delete_failed'), 'error', t('admin_messages.delete_failed_title'));
    }
  };

  // 데이터 내보내기
  const exportData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [deptName, authType] = deptFilter ? deptFilter.split('|') : ['', ''];
      const params = new URLSearchParams({
        search: searchTerm,
        department: deptName,
        model: selectedModel,
        role: selectedRole,
        dateRange: dateRange,
        export: 'true',
      });
      if (authType) params.set('authType', authType);
      // 채팅방 ID 필터가 입력된 경우에만 파라미터 추가
      if (selectedRoomId) {
        params.append('roomId', selectedRoomId);
      }
      // 사용자 필터가 입력된 경우에만 파라미터 추가
      if (selectedUser) {
        params.append('user', selectedUser);
      }

      const response = await fetch(`/api/admin/messages?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('데이터 내보내기 실패');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `messages_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      logger.error('데이터 내보내기 실패:', error);
      alert(t('admin_messages.export_failed'), 'error', t('admin_messages.export_failed_title'));
    }
  };

  // 검색 및 필터 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    deptFilter,
    selectedModel,
    selectedRole,
    selectedRoomId,
    selectedUser,
    dateRange,
    customStartDate,
    customEndDate,
  ]);

  // 데이터 로드
  useEffect(() => {
    fetchMessages();
  }, [
    currentPage,
    searchTerm,
    deptFilter,
    selectedModel,
    selectedRole,
    selectedFeedback,
    selectedRoomId,
    selectedUser,
    dateRange,
    customStartDate,
    customEndDate,
    fetchMessages,
  ]);

  // 폴링 설정 - 30초마다 자동 새로고침
  useEffect(() => {
    if (!isPollingEnabled) return;

    const interval = setInterval(() => {
      // 현재 첫 번째 페이지이고 검색 필터가 없을 때만 자동 새로고침
      if (
        currentPage === 1 &&
        !searchTerm &&
        !deptFilter &&
        !selectedModel &&
        !selectedRole &&
        !selectedRoomId &&
        !selectedUser &&
        dateRange === '7d'
      ) {
        fetchMessages(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [
    isPollingEnabled,
    currentPage,
    searchTerm,
    deptFilter,
    selectedModel,
    selectedRole,
    selectedRoomId,
    selectedUser,
    dateRange,
    fetchMessages,
  ]);

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => setIsPollingEnabled(false);
  }, []);

  // 페이지 visibility 변경 시 폴링 상태 관리
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 페이지가 숨겨지면 폴링 일시 중지
        setIsPollingEnabled(false);
      } else {
        // 페이지가 다시 보이면 폴링 재시작 및 즉시 새로고침
        setIsPollingEnabled(true);
        fetchMessages(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchMessages]);

  // 모달이 열렸을 때 배경 스크롤 방지
  useEffect(() => {
    if (showMessageModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showMessageModal]);

  useEffect(() => {
    if (!showMessageModal || !messageContentRef.current) {
      setHasMessageOverflow(false);
      return;
    }
    const el = messageContentRef.current;
    setHasMessageOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [showMessageModal, selectedMessage, messageViewMode]);

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

  // 활성 필터 개수 계산
  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (deptFilter) count++;
    if (selectedModel) count++;
    if (selectedRole) count++;
    if (selectedFeedback) count++;
    if (selectedRoomId) count++;
    if (selectedUser) count++;
    if (dateRange === 'custom') {
      if (customStartDate || customEndDate) count++;
    } else if (dateRange !== '7d') {
      count++;
    }
    return count;
  };

  // 모든 필터 초기화
  const clearAllFilters = () => {
    setSearchTerm('');
    setDeptFilter('');
    setSelectedModel('');
    setSelectedRole('');
    setSelectedFeedback('');
    setSelectedRoomId('');
    setSelectedUser('');
    setDateRange('7d');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  // 시스템 메시지인지 확인하는 헬퍼 함수
  const isSystemMessage = (text) => {
    return (
      text && typeof text === 'string' && text.includes('[방제목 생성 요청]')
    );
  };

  // 역할에 따른 표시 이름 반환
  const getRoleLabel = (role, text = '') => {
    if (isSystemMessage(text)) {
      return t('admin_messages.role_system');
    }
    return role === 'user' ? t('admin_messages.role_user') : 'AI';
  };

  // 역할에 따른 아이콘 반환
  const getRoleIcon = (role, text = '') => {
    if (isSystemMessage(text)) {
      return <Bot className='h-5 w-5 text-primary' />;
    }
    return role === 'user' ? (
      <User className='h-5 w-5 text-primary' />
    ) : (
      <Bot className='h-5 w-5 text-primary' />
    );
  };

  const getRoleBadge = (role, text = '') => {
    // 시스템 요청 메시지 확인 (방제목 생성 요청 등)
    if (isSystemMessage(text)) {
      return (
        <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
          <Bot className='h-3 w-3 mr-1' />
          {t('admin_messages.role_system')}
        </span>
      );
    }

    if (role === 'user') {
      return (
        <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
          <User className='h-3 w-3 mr-1' />
          {t('admin_messages.role_user')}
        </span>
      );
    }
    return (
      <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
        <Bot className='h-3 w-3 mr-1' />
        AI
      </span>
    );
  };

  const truncateText = (text, maxLength = 50) => {
    // 객체나 배열인 경우 JSON 문자열로 변환
    let textStr;
    if (text === null || text === undefined) {
      return '';
    } else if (typeof text === 'object') {
      try {
        textStr = JSON.stringify(text, null, 2);
      } catch (e) {
        textStr = String(text);
      }
    } else {
      textStr = String(text);
    }

    if (textStr.length <= maxLength) return textStr;
    return textStr.slice(0, maxLength) + '...';
  };

  const normalizeMessageText = (text) => {
    if (text === null || text === undefined) {
      return '';
    }
    if (typeof text === 'object') {
      try {
        return JSON.stringify(text, null, 2);
      } catch (e) {
        return String(text);
      }
    }
    return String(text);
  };

  const openMessageModal = (message) => {
    setSelectedMessage(message);
    setMessageViewMode('markdown');
    setShowMessageModal(true);
  };

  // 채팅방 ID를 짧게 표시하는 함수
  const formatRoomId = (roomId) => {
    if (!roomId) return '';
    // UUID 형식인 경우 앞 8자만 표시
    if (roomId.length > 8) {
      return roomId.substring(0, 8) + '...';
    }
    return roomId;
  };

  const getFeedbackBadge = (feedback) => {
    // 피드백 값 정규화 (문자열로 변환 후 소문자로 변환)
    const normalizedFeedback = feedback
      ? String(feedback).toLowerCase().trim()
      : null;

    if (normalizedFeedback === 'like') {
      return (
        <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
          <ThumbsUp className='h-3 w-3 mr-1' />
          {t('admin_messages.feedback_like')}
        </span>
      );
    }
    if (normalizedFeedback === 'dislike') {
      return (
        <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive'>
          <ThumbsDown className='h-3 w-3 mr-1' />
          {t('admin_messages.feedback_dislike')}
        </span>
      );
    }
    return <span className='text-xs text-muted-foreground'>-</span>;
  };

  return (
    <div className='space-y-6'>
      {/* 페이지 헤더 */}
      <div className='bg-muted rounded-lg p-6 border border-border'>
        <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4'>
          <div className='flex-1'>
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
              사용자 메시지
            </div>
            <h1
              className='font-bold flex items-center gap-3'
              style={{
                fontSize: 'clamp(22px, 2.6vw, 28px)',
                letterSpacing: '-0.02em',
                color: 'var(--hn-fg)',
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {t('admin_messages.page_title')}
            </h1>
            <p className='text-muted-foreground mt-2 text-sm'>
              {t('admin_messages.page_subtitle')}
            </p>

            {/* 통계 요약 */}
            <div className='flex flex-wrap items-center gap-4 mt-4'>
              <div className='flex items-center gap-2 bg-card px-4 py-2 rounded-lg shadow-sm'>
                <BarChart3 className='h-4 w-4 text-primary' />
                <span className='text-sm text-muted-foreground'>
                  {t('admin_messages.total_messages')}
                </span>
                <span className='text-lg font-bold text-foreground'>
                  {totalCount.toLocaleString()}
                </span>
              </div>

              <div className='flex items-center gap-2 bg-card px-4 py-2 rounded-lg shadow-sm'>
                <div
                  className={`w-2 h-2 rounded-full ${
                    isPollingEnabled
                      ? 'bg-primary animate-pulse'
                      : 'bg-muted-foreground'
                  }`}
                ></div>
                <span className='text-sm text-muted-foreground'>
                  {isPollingEnabled
                    ? t('admin_messages.auto_refresh_active')
                    : t('admin_messages.auto_refresh_inactive')}
                </span>
              </div>

              <div className='flex items-center gap-2 bg-card px-4 py-2 rounded-lg shadow-sm'>
                <Clock className='h-4 w-4 text-muted-foreground' />
                <span className='text-sm text-muted-foreground'>
                  {lastRefresh.toLocaleTimeString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* 액션 버튼 그룹 */}
          <div className='flex flex-wrap items-center gap-2'>
            <div className='flex items-center gap-2 bg-card p-1 rounded-lg shadow-sm'>
              <button
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent'
                }`}
                title={t('admin_messages.table_view')}
              >
                <List className='h-4 w-4' />
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'card'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent'
                }`}
                title={t('admin_messages.card_view')}
              >
                <LayoutGrid className='h-4 w-4' />
              </button>
            </div>

            <button
              onClick={() => setIsPollingEnabled(!isPollingEnabled)}
              className={`inline-flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-all shadow-sm ${
                isPollingEnabled
                  ? 'bg-muted hover:bg-muted/80 text-foreground'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground'
              }`}
              title={
                isPollingEnabled ? t('admin_messages.auto_refresh_stop') : t('admin_messages.auto_refresh_start')
              }
            >
              {isPollingEnabled ? (
                <Pause className='h-4 w-4 mr-2' />
              ) : (
                <Play className='h-4 w-4 mr-2' />
              )}
              {isPollingEnabled ? t('admin_messages.stop') : t('admin_messages.start')}
            </button>

            <button
              onClick={() => fetchMessages()}
              disabled={loading}
              className='inline-flex items-center px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-muted text-white text-sm font-medium rounded-lg transition-all shadow-sm'
              title={t('admin_messages.manual_refresh')}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
              />
              {t('admin_messages.refresh')}
            </button>

            <button
              onClick={exportData}
              className='inline-flex items-center px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-all shadow-sm'
            >
              <Download className='h-4 w-4 mr-2' />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className='bg-card rounded-lg border border-border shadow-sm overflow-hidden'>
        {/* 필터 헤더 */}
        <div className='bg-muted px-6 py-4 border-b border-border'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <Filter className='h-5 w-5 text-foreground' />
              <h3 className='text-lg font-semibold text-foreground'>
                {t('admin_messages.filter_and_search')}
              </h3>
              {getActiveFiltersCount() > 0 && (
                <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
                  {t('admin_messages.active_count', { count: getActiveFiltersCount() })}
                </span>
              )}
            </div>
            <div className='flex items-center gap-2'>
              {getActiveFiltersCount() > 0 && (
                <button
                  onClick={clearAllFilters}
                  className='inline-flex items-center px-3 py-1.5 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors'
                >
                  <XCircle className='h-4 w-4 mr-1' />
                  {t('admin_messages.clear_all')}
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className='inline-flex items-center px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-lg transition-colors'
              >
                {showFilters ? (
                  <>
                    <ChevronUp className='h-4 w-4 mr-1' />
                    {t('admin_messages.hide')}
                  </>
                ) : (
                  <>
                    <ChevronDown className='h-4 w-4 mr-1' />
                    {t('admin_messages.expand')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 필터 콘텐츠 */}
        {showFilters && (
          <div className='p-6'>
            <div className='space-y-4'>
              {/* 검색 영역 */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div className={dateRange === 'custom' ? 'lg:col-span-3' : ''}>
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <Search className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.search_message_content')}
                  </label>
                  <div className='relative'>
                    <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
                    <input
                      type='text'
                      placeholder={t('admin_messages.search_message_placeholder')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className='w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className='absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground'
                      >
                        <XCircle className='h-4 w-4' />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <User className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.search_user')}
                  </label>
                  <div className='relative'>
                    <User className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
                    <input
                      type='text'
                      placeholder={t('admin_messages.search_user_placeholder')}
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      className='w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                    />
                    {selectedUser && (
                      <button
                        onClick={() => setSelectedUser('')}
                        className='absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground'
                      >
                        <XCircle className='h-4 w-4' />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 필터 옵션 */}
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <Building className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.group')}
                  </label>
                  <select
                    value={deptFilter}
                    onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }}
                    className='w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                  >
                    <option value=''>{t('admin_messages.all_groups')}</option>
                    {departments.map((dept) => (
                      <option key={dept.value} value={dept.value}>
                        {dept.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <User className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.role')}
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className='w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                  >
                    <option value=''>{t('admin_messages.all_roles')}</option>
                    <option value='user'>{t('admin_messages.role_user')}</option>
                    <option value='assistant'>AI</option>
                  </select>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <ThumbsUp className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.feedback')}
                  </label>
                  <select
                    value={selectedFeedback}
                    onChange={(e) => setSelectedFeedback(e.target.value)}
                    className='w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                  >
                    <option value=''>{t('admin_messages.all_feedback')}</option>
                    <option value='like'>{t('admin_messages.feedback_like')}</option>
                    <option value='dislike'>{t('admin_messages.feedback_dislike')}</option>
                    <option value='none'>{t('admin_messages.feedback_none')}</option>
                  </select>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <Bot className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.model')}
                  </label>
                  <div className='relative'>
                    <input
                      type='text'
                      placeholder={t('admin_messages.model_placeholder')}
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className='w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                    />
                    {selectedModel && (
                      <button
                        onClick={() => setSelectedModel('')}
                        className='absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground'
                      >
                        <XCircle className='h-4 w-4' />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <Hash className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.room_id_search')}
                  </label>
                  <div className='relative'>
                    <input
                      type='text'
                      placeholder={t('admin_messages.room_id_placeholder')}
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className='w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground font-mono text-sm transition-all'
                    />
                    {selectedRoomId && (
                      <button
                        onClick={() => setSelectedRoomId('')}
                        className='absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground'
                      >
                        <XCircle className='h-4 w-4' />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className='mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'>
                <div
                  className={
                    dateRange === 'custom' ? 'sm:col-span-2 lg:col-span-2' : ''
                  }
                >
                  <label className='block text-sm font-medium text-foreground mb-2'>
                    <Calendar className='inline h-4 w-4 mr-1' />
                    {t('admin_messages.period')}
                  </label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className='w-full px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                  >
                    {dateRangeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {dateRange === 'custom' && (
                    <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2'>
                      <input
                        type='date'
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        onClick={(e) => e.currentTarget.showPicker?.()}
                        className='w-full min-w-[140px] px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                      />
                      <input
                        type='date'
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        onClick={(e) => e.currentTarget.showPicker?.()}
                        className='w-full min-w-[140px] px-3 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground transition-all'
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 활성 필터 태그 표시 */}
              {getActiveFiltersCount() > 0 && (
                <div className='pt-4 border-t border-border'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-sm font-medium text-foreground'>
                      {t('admin_messages.active_filters')}
                    </span>
                    {searchTerm && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
                        {t('admin_messages.filter_search')}: {searchTerm.substring(0, 20)}
                        {searchTerm.length > 20 ? '...' : ''}
                        <button
                          onClick={() => setSearchTerm('')}
                          className='ml-1.5 hover:text-primary'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                    {selectedRoomId && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary font-mono'>
                        {t('admin_messages.filter_room_id')}: {formatRoomId(selectedRoomId)}
                        <button
                          onClick={() => setSelectedRoomId('')}
                          className='ml-1.5 hover:text-primary'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                    {selectedUser && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
                        {t('admin_messages.filter_user')}: {selectedUser.substring(0, 20)}
                        {selectedUser.length > 20 ? '...' : ''}
                        <button
                          onClick={() => setSelectedUser('')}
                          className='ml-1.5 hover:text-primary'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                    {(dateRange !== '7d' &&
                      (dateRange !== 'custom' ||
                        customStartDate ||
                        customEndDate)) && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
                        {t('admin_messages.filter_period')}:{' '}
                        {dateRange === 'custom'
                          ? `${customStartDate || t('admin_messages.no_start')} ~ ${
                              customEndDate || t('admin_messages.no_end')
                            }`
                          : dateRangeOptions.find(
                              (opt) => opt.value === dateRange
                            )?.label}
                        <button
                          onClick={() => {
                            setDateRange('7d');
                            setCustomStartDate('');
                            setCustomEndDate('');
                          }}
                          className='ml-1.5 hover:text-primary'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                    {deptFilter && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
                        {t('admin_messages.filter_group')}: {departments.find((d) => d.value === deptFilter)?.label || deptFilter.split('|')[0].replaceAll('부서', '그룹')}
                        <button
                          onClick={() => setDeptFilter('')}
                          className='ml-1.5 hover:text-primary'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                    {selectedRole && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground'>
                        {t('admin_messages.filter_role')}: {selectedRole === 'user' ? t('admin_messages.role_user') : 'AI'}
                        <button
                          onClick={() => setSelectedRole('')}
                          className='ml-1.5 hover:text-foreground'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                    {selectedFeedback && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground'>
                        {t('admin_messages.filter_feedback')}:{' '}
                        {selectedFeedback === 'like'
                          ? t('admin_messages.feedback_like')
                          : selectedFeedback === 'dislike'
                          ? t('admin_messages.feedback_dislike')
                          : t('admin_messages.feedback_none_label')}
                        <button
                          onClick={() => setSelectedFeedback('')}
                          className='ml-1.5 hover:text-foreground'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                    {selectedModel && (
                      <span className='inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary'>
                        {t('admin_messages.filter_model')}: {selectedModel}
                        <button
                          onClick={() => setSelectedModel('')}
                          className='ml-1.5 hover:text-primary'
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 메시지 목록 */}
      <div className='bg-card rounded-lg border border-border shadow-sm overflow-hidden'>
        {loading ? (
          <div className='flex flex-col items-center justify-center h-64 space-y-4'>
            <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
            <p className='text-sm text-muted-foreground'>
              {t('admin_messages.loading_data')}
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className='text-center py-16'>
            <div className='inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4'>
              <MessageCircle className='h-8 w-8 text-muted-foreground' />
            </div>
            <h3 className='text-lg font-medium text-foreground mb-2'>
              {t('admin_messages.no_messages')}
            </h3>
            <p className='text-sm text-muted-foreground'>
              {getActiveFiltersCount() > 0
                ? t('admin_messages.no_messages_with_filter')
                : t('admin_messages.no_messages_yet')}
            </p>
            {getActiveFiltersCount() > 0 && (
              <button
                onClick={clearAllFilters}
                className='mt-4 inline-flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors'
              >
                <XCircle className='h-4 w-4 mr-2' />
                {t('admin_messages.reset_filters')}
              </button>
            )}
          </div>
        ) : viewMode === 'card' ? (
          /* 카드 뷰 */
          <div className='p-6'>
            <div className='max-h-[70vh] overflow-y-auto pr-2'>
              <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4'>
              {messages.map((message) => (
                <div
                  key={message._id}
                  className='bg-card border border-border rounded-lg p-5 hover:shadow-lg transition-all duration-200 hover:border-primary'
                  onDoubleClick={() => openMessageModal(message)}
                >
                  {/* 카드 헤더 */}
                  <div className='flex items-start justify-between mb-3'>
                    <div className='flex items-center gap-2 flex-1 min-w-0'>
                      {getRoleIcon(message.role, message.text)}
                      <div className='flex-1 min-w-0'>
                        <button
                          onClick={() => {
                            setSelectedUser(message.name || message.email);
                            setCurrentPage(1);
                          }}
                          className='font-medium text-foreground text-sm truncate hover:text-primary transition-colors block text-left w-full'
                          title={t('admin_messages.filter_by_user', { name: message.name || message.email })}
                        >
                          {message.name || t('admin_messages.no_name')}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(message.email);
                            setCurrentPage(1);
                          }}
                          className='text-xs text-muted-foreground truncate hover:text-primary transition-colors block text-left w-full'
                          title={t('admin_messages.filter_by_email', { email: message.email })}
                        >
                          {message.email}
                        </button>
                      </div>
                    </div>
                    {getRoleBadge(message.role, message.text)}
                  </div>

                  {/* 메시지 내용 */}
                  <div className='mb-3'>
                    <div className='text-sm text-foreground line-clamp-3 mb-2'>
                      {truncateText(message.text, 150)}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedRoomId(message.roomId);
                        setCurrentPage(1);
                      }}
                      className='inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors font-mono'
                      title={t('admin_messages.filter_by_room', { roomId: message.roomId })}
                    >
                      <Hash className='h-3 w-3' />
                      {formatRoomId(message.roomId)}
                    </button>
                  </div>

                  {/* 메타 정보 */}
                  <div className='space-y-2 mb-3'>
                    {message.department && (
                      <div className='flex items-center text-xs text-muted-foreground'>
                        <Building className='h-3 w-3 mr-1 flex-shrink-0' />
                            <span className='truncate'>
                              {message.department.replaceAll('부서', '그룹')}
                            </span>
                      </div>
                    )}
                    <div className='flex items-center justify-between text-xs'>
                      <span className='inline-flex items-center text-muted-foreground'>
                        <Clock className='h-3 w-3 mr-1' />
                        {formatDate(message.createdAt)}
                      </span>
                      {message.role === 'assistant' &&
                        getFeedbackBadge(message.feedback)}
                    </div>
                    {(() => {
                      const hasLabel =
                        message.modelLabel &&
                        message.modelLabel.trim() &&
                        message.modelLabel !== 'N/A';
                      const hasModel = message.model && message.model.trim();

                      if (!hasLabel && !hasModel) return null;

                      return (
                        <div className='text-xs bg-muted text-foreground px-2 py-1 rounded inline-block'>
                          {hasLabel ? message.modelLabel : message.model}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 액션 버튼 */}
                  <div className='flex items-center justify-end gap-2 pt-3 border-t border-border'>
                    <button
                      onClick={() => openMessageModal(message)}
                      className='inline-flex items-center px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors'
                      title={t('admin_messages.view_detail')}
                    >
                      <Eye className='h-3 w-3 mr-1' />
                      {t('admin_messages.detail')}
                    </button>
                    <button
                      onClick={() => deleteMessage(message._id)}
                      className='inline-flex items-center px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors'
                      title={t('admin_messages.delete_message')}
                    >
                      <Trash2 className='h-3 w-3 mr-1' />
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>
        ) : (
          /* 테이블 뷰 */
          <>
            {/* 테이블 헤더 */}
            <div className='bg-muted px-6 py-4 border-b-2 border-border'>
              <div className='grid grid-cols-12 gap-4 text-xs font-bold text-foreground uppercase tracking-wider'>
                <div className='col-span-2 flex items-center gap-1'>
                  <User className='h-3.5 w-3.5' />
                  {t('admin_messages.col_user')}
                </div>
                <div className='col-span-1 flex items-center gap-1'>
                  <Bot className='h-3.5 w-3.5' />
                  {t('admin_messages.col_role')}
                </div>
                <div className='col-span-3 flex items-center gap-1'>
                  <MessageCircle className='h-3.5 w-3.5' />
                  {t('admin_messages.col_message')}
                </div>
                <div className='col-span-1 flex items-center gap-1'>
                  <Bot className='h-3.5 w-3.5' />
                  {t('admin_messages.col_model')}
                </div>
                <div className='col-span-1 flex items-center gap-1'>
                  <ThumbsUp className='h-3.5 w-3.5' />
                  {t('admin_messages.col_feedback')}
                </div>
                <div className='col-span-2 flex items-center gap-1'>
                  <Clock className='h-3.5 w-3.5' />
                  {t('admin_messages.col_time')}
                </div>
                <div className='col-span-2 text-center'>{t('admin_messages.col_actions')}</div>
              </div>
            </div>

            {/* 메시지 목록 */}
            <div className='max-h-[70vh] overflow-y-auto'>
              <div className='divide-y divide-border'>
              {messages.map((message, index) => (
                <div
                  key={message._id}
                  className={`px-6 py-4 transition-all duration-150 ${
                    index % 2 === 0
                      ? 'bg-card'
                      : 'bg-muted/50'
                  } hover:bg-accent hover:shadow-sm`}
                  onDoubleClick={() => openMessageModal(message)}
                >
                  <div className='grid grid-cols-12 gap-4 items-center'>
                    {/* 사용자 정보 */}
                    <div className='col-span-2'>
                      <div className='text-sm'>
                        <button
                          onClick={() => {
                            setSelectedUser(message.name || message.email);
                            setCurrentPage(1);
                          }}
                          className='font-semibold text-foreground truncate hover:text-primary transition-colors text-left'
                          title={t('admin_messages.filter_by_user', { name: message.name || message.email })}
                        >
                          {message.name || t('admin_messages.no_name')}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(message.email);
                            setCurrentPage(1);
                          }}
                          className='block text-muted-foreground text-xs truncate hover:text-primary transition-colors text-left'
                          title={t('admin_messages.filter_by_email', { email: message.email })}
                        >
                          {message.email}
                        </button>
                        {message.department && (
                          <div className='flex items-center mt-1.5 text-xs text-muted-foreground'>
                            <Building className='h-3 w-3 mr-1 flex-shrink-0' />
                            <span className='truncate'>
                            {message.department.replaceAll('부서', '그룹')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 역할 */}
                    <div className='col-span-1'>
                      {getRoleBadge(message.role, message.text)}
                    </div>

                    {/* 메시지 내용 */}
                    <div className='col-span-3'>
                      <div className='text-sm text-foreground leading-relaxed mb-2'>
                        {truncateText(message.text, 120)}
                      </div>
                      <div className='flex items-center flex-wrap gap-2'>
                        <button
                          onClick={() => {
                            setSelectedRoomId(message.roomId);
                            setCurrentPage(1);
                          }}
                          className='inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors font-mono'
                          title={t('admin_messages.filter_by_room', { roomId: message.roomId })}
                        >
                          <Hash className='h-3 w-3' />
                          {formatRoomId(message.roomId)}
                        </button>
                        {message.clientIP && (
                          <span className='text-xs text-muted-foreground font-mono'>
                            {message.clientIP}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 모델 */}
                    <div className='col-span-1 min-w-0'>
                      <div className='flex flex-col gap-1.5'>
                        <span className='text-xs bg-muted text-foreground px-2.5 py-1 rounded-md break-words overflow-wrap-anywhere font-medium'>
                          {(() => {
                            const hasLabel =
                              message.modelLabel &&
                              message.modelLabel.trim() &&
                              message.modelLabel !== 'N/A';
                            const hasModel =
                              message.model && message.model.trim();

                            if (hasLabel) return message.modelLabel;
                            if (hasModel) {
                              return message.model;
                            }
                            return 'N/A';
                          })()}
                        </span>
                        {message.retryCount && message.retryCount > 1 && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                              message.retryCount === 2
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {t('admin_messages.retry_count', { count: message.retryCount })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 피드백 */}
                    <div className='col-span-1'>
                      {getFeedbackBadge(message.feedback)}
                    </div>

                    {/* 시간 */}
                    <div className='col-span-2'>
                      <div className='flex items-center text-xs text-muted-foreground'>
                        <Calendar className='h-3.5 w-3.5 mr-1.5 flex-shrink-0' />
                        <span className='leading-tight'>
                          {formatDate(message.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* 작업 버튼 */}
                    <div className='col-span-2'>
                      <div className='flex items-center justify-center gap-2'>
                        {/* 상세 보기 */}
                        <button
                          onClick={() => openMessageModal(message)}
                          className='p-2 text-primary hover:text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-all duration-150 hover:scale-105'
                          title={t('admin_messages.view_detail')}
                        >
                          <Eye className='h-4 w-4' />
                        </button>

                        {/* 메시지 삭제 */}
                        <button
                          onClick={() => deleteMessage(message._id)}
                          className='p-2 text-destructive hover:text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-all duration-150 hover:scale-105'
                          title={t('admin_messages.delete_message')}
                        >
                          <Trash2 className='h-4 w-4' />
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
        <div className='bg-card border border-border rounded-lg shadow-sm p-4'>
          <div className='flex flex-col sm:flex-row items-center justify-between gap-4'>
            {/* 페이지 정보 */}
            <div className='text-sm text-muted-foreground'>
              <span className='font-medium text-foreground'>
                {((currentPage - 1) * 20 + 1).toLocaleString()}
              </span>
              {' - '}
              <span className='font-medium text-foreground'>
                {Math.min(currentPage * 20, totalCount).toLocaleString()}
              </span>
              {' / '}
              <span className='font-medium text-foreground'>
                {totalCount.toLocaleString()}
              </span>
              {' '}{t('admin_messages.unit_messages')}
            </div>

            {/* 페이지 네비게이션 */}
            <div className='flex items-center gap-2'>
              {/* 첫 페이지 */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className='px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                title={t('admin_messages.first_page')}
              >
                ««
              </button>

              {/* 이전 페이지 */}
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className='px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              >
                ‹ {t('admin_messages.prev')}
              </button>

              {/* 페이지 번호 */}
              <div className='flex items-center gap-1'>
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

              {/* 다음 페이지 */}
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className='px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              >
                {t('admin_messages.next')} ›
              </button>

              {/* 마지막 페이지 */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className='px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                title={t('admin_messages.last_page')}
              >
                »»
              </button>
            </div>

            {/* 페이지 이동 */}
            <div className='flex items-center gap-2'>
              <input
                type='number'
                min='1'
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value);
                  if (page >= 1 && page <= totalPages) {
                    setCurrentPage(page);
                  }
                }}
                className='w-20 px-3 py-2 text-sm text-center border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground'
                placeholder={t('admin_messages.page')}
              />
              <span className='text-sm text-muted-foreground'>
                / {totalPages}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 메시지 상세 보기 모달 */}
      {showMessageModal && selectedMessage && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          {/* 배경 오버레이 */}
          <div
            className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
            onClick={() => setShowMessageModal(false)}
          ></div>

          {/* 모달 내용 */}
          <div className='relative bg-card rounded-lg shadow-xl w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl max-h-[90vh] overflow-y-auto p-6'>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-lg font-medium text-foreground'>
                {t('admin_messages.message_detail')}
              </h3>
              <button
                onClick={() => setShowMessageModal(false)}
                className='text-muted-foreground hover:text-foreground'
              >
                <X className='h-5 w-5' />
              </button>
            </div>

            <div className='space-y-6'>
              {/* 메시지 내용 (가장 중요하므로 맨 위로) */}
              <div>
                <div className='flex flex-wrap items-center gap-2 mb-3'>
                  {getRoleIcon(selectedMessage.role, selectedMessage.text)}
                  <h4 className='text-lg font-medium text-foreground'>
                    {isSystemMessage(selectedMessage.text)
                      ? t('admin_messages.system_message')
                      : selectedMessage.role === 'user'
                      ? t('admin_messages.user_message')
                      : t('admin_messages.ai_response')}
                  </h4>
                  <div className='ml-auto flex items-center gap-2'>
                    <button
                      onClick={() => setMessageViewMode('markdown')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        messageViewMode === 'markdown'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground hover:bg-accent'
                      }`}
                    >
                      {t('admin_messages.markdown')}
                    </button>
                    <button
                      onClick={() => setMessageViewMode('raw')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        messageViewMode === 'raw'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground hover:bg-accent'
                      }`}
                    >
                      {t('admin_messages.raw')}
                    </button>
                  </div>
                </div>
                <div className='text-xs text-muted-foreground mb-2'>
                  {t('admin_messages.char_count')}: {normalizeMessageText(selectedMessage.text).length}
                  {hasMessageOverflow ? ` · ${t('admin_messages.has_scroll')}` : ''}
                </div>
                <div
                  ref={messageContentRef}
                  className={`bg-muted p-4 rounded-lg border-l-4 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/70 scrollbar-track-muted dark:scrollbar-thumb-muted-foreground dark:scrollbar-track-muted ${
                    isSystemMessage(selectedMessage.text)
                      ? 'border-primary'
                      : selectedMessage.role === 'user'
                      ? 'border-primary'
                      : 'border-primary'
                  }`}
                >
                  {messageViewMode === 'markdown' ? (
                    <div className='markdown-content w-full'>
                      <MarkdownPreview
                        source={normalizeMessageText(selectedMessage.text)}
                      />
                    </div>
                  ) : (
                    <div className='whitespace-pre-wrap text-sm text-foreground leading-relaxed font-mono'>
                      {normalizeMessageText(selectedMessage.text)}
                    </div>
                  )}
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {/* 사용자 정보 */}
                <div>
                  <h4 className='text-sm font-medium text-foreground mb-3 flex items-center gap-2'>
                    <User className='h-4 w-4' />
                    {t('admin_messages.user_info')}
                  </h4>
                  <div className='bg-muted p-4 rounded-lg space-y-2'>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('admin_messages.label_name')}
                      </span>
                      <span className='font-medium text-foreground'>
                        {selectedMessage.name || t('admin_messages.no_name')}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('admin_messages.label_email')}
                      </span>
                      <span className='font-medium text-foreground'>
                        {selectedMessage.email}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('admin_messages.label_group')}
                      </span>
                      <span className='font-medium text-foreground'>
                        {selectedMessage.department || t('admin_messages.not_set')}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        Cell:
                      </span>
                      <span className='font-medium text-foreground'>
                        {selectedMessage.cell || t('admin_messages.not_set')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 메시지 메타데이터 */}
                <div>
                  <h4 className='text-sm font-medium text-foreground mb-3 flex items-center gap-2'>
                    <MessageCircle className='h-4 w-4' />
                    {t('admin_messages.message_info')}
                  </h4>
                  <div className='bg-muted p-4 rounded-lg space-y-2'>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('admin_messages.label_model')}
                      </span>
                      <span className='font-medium text-foreground'>
                        {(() => {
                          const hasLabel =
                            selectedMessage.modelLabel &&
                            selectedMessage.modelLabel.trim() &&
                            selectedMessage.modelLabel !== 'N/A';
                          const hasModel =
                            selectedMessage.model &&
                            selectedMessage.model.trim();

                          if (!hasLabel && !hasModel) return 'N/A';

                          return (
                            <div className='flex flex-col gap-1 items-end max-w-full'>
                              <span className='px-2 py-1 bg-primary/10 text-primary rounded text-xs break-words overflow-wrap-anywhere'>
                                {hasLabel
                                  ? selectedMessage.modelLabel
                                  : selectedMessage.model}
                              </span>
                              {selectedMessage.retryCount &&
                                selectedMessage.retryCount > 1 && (
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${
                                      selectedMessage.retryCount === 2
                                        ? 'bg-muted text-muted-foreground'
                                        : 'bg-muted text-muted-foreground'
                                    }`}
                                  >
                                    {t('admin_messages.retry_count', { count: selectedMessage.retryCount })}
                                  </span>
                                )}
                            </div>
                          );
                        })()}
                      </span>
                    </div>
                    {selectedMessage.role === 'assistant' && (
                      <div className='flex justify-between'>
                        <span className='text-muted-foreground'>
                          {t('admin_messages.label_feedback')}
                        </span>
                        <span className='font-medium text-foreground'>
                          {getFeedbackBadge(selectedMessage.feedback)}
                        </span>
                      </div>
                    )}
                    <div className='flex justify-between items-center'>
                      <span className='text-muted-foreground'>
                        {t('admin_messages.label_room_id')}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedRoomId(selectedMessage.roomId);
                          setCurrentPage(1);
                          setShowMessageModal(false);
                        }}
                        className='inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors font-mono'
                        title={t('admin_messages.filter_by_room', { roomId: selectedMessage.roomId })}
                      >
                        <Hash className='h-3 w-3' />
                        {formatRoomId(selectedMessage.roomId)}
                      </button>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('admin_messages.label_ip')}
                      </span>
                      <span className='font-medium text-foreground font-mono text-xs'>
                        {selectedMessage.clientIP || t('admin_messages.not_recorded')}
                      </span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('admin_messages.label_time')}
                      </span>
                      <span className='font-medium text-foreground text-xs'>
                        {formatDate(selectedMessage.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className='mt-6 flex justify-end'>
              <button
                onClick={() => setShowMessageModal(false)}
                className='px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors'
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
