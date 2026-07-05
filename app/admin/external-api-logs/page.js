'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Filter,
  RefreshCw,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Monitor,
  Code,
  Database,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Eye,
  X,
  Copy,
  Hash,
} from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';

export default function ExternalApiLogsPage() {
  const { alert } = useAlert();
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [filters, setFilters] = useState({
    apiType: '',
    model: '',
    clientTool: '',
    clientIP: '', // IP 필터 추가
    endpoint: '',
    provider: '',
    timeRange: '7d',
    source: '',
    statusCode: '',
    isStream: '',
    // 세션 필터
    sessionHash: '',
    userId: '',
    tokenHash: '',
    sessionFilter: '', // 'exact' | 'user' | 'session'
    conversationId: '', // 대화 세션 ID
    groupByConversation: false, // 대화 세션별 그룹화
    page: 1,
    limit: 50,
  });
  const [pagination, setPagination] = useState({});
  const [promptModal, setPromptModal] = useState({ isOpen: false, log: null }); // 프롬프트 모달 상태
  const [expandedLogs, setExpandedLogs] = useState(new Set()); // 펼쳐진 로그 ID 집합
  const [expandedConversations, setExpandedConversations] = useState(new Set()); // 펼쳐진 대화 세션 ID 집합
  const [expandedMessages, setExpandedMessages] = useState(new Set()); // 펼쳐진 메시지 목록 (로그 ID 집합)
  const [expandedMessageContents, setExpandedMessageContents] = useState(
    new Set()
  ); // 펼쳐진 개별 메시지 내용 (로그ID-메시지인덱스)

  // UI 섹션 표시 상태
  const [showFilters, setShowFilters] = useState(false); // 필터 섹션 접기
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false); // 고급 필터 섹션 접기
  const [showDetailedStats, setShowDetailedStats] = useState(false); // 상세 통계 접기

  // API 로그 조회
  const fetchLogs = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setLoading(true);

        const token = localStorage.getItem('token');
        if (!token) {
          logger.error('토큰이 없습니다');
          return;
        }

        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== '' && value !== null && value !== undefined) {
            if (key === 'groupByConversation') {
              params.append(key, value.toString());
            } else {
              params.append(key, value);
            }
          }
        });

        // custom 기간 지정 시 날짜 파라미터 추가
        if (filters.timeRange === 'custom') {
          if (customStartDate) params.append('startDate', customStartDate);
          if (customEndDate) params.append('endDate', customEndDate);
        }

        const response = await fetch(`/api/admin/external-api-logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setLogs(data.data.logs);
          setStats(data.data.stats);
          setPagination(data.data.pagination);
        } else if (response.status === 401) {
          logger.error('인증 실패');
          alert(
            t('admin_api_logs.auth_required'),
            'error',
            t('admin_api_logs.auth_failed')
          );
        } else {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.error || t('admin_api_logs.server_error', { status: response.status });
          logger.error('로그 조회 실패:', response.status, errorMessage);
          alert(
            t('admin_api_logs.log_fetch_failed', { error: errorMessage }),
            'error',
            t('admin_api_logs.fetch_failed_title')
          );
        }
      } catch (error) {
        logger.error('로그 조회 오류:', error);
        alert(
          t('admin_api_logs.log_fetch_error', { error: error.message }),
          'error',
          t('admin_api_logs.error_occurred')
        );
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [filters, customStartDate, customEndDate, alert, t]
  );

  useEffect(() => {
    // custom 모드가 아닐 때만 자동 조회
    if (filters.timeRange !== 'custom') {
      fetchLogs();
    }
  }, [fetchLogs, filters.timeRange]);

  // 필터 변경 핸들러
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // 필터 변경 시 첫 페이지로
    }));
  };

  // 필터 초기화 핸들러
  const handleResetFilters = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setFilters({
      apiType: '',
      model: '',
      clientTool: '',
      clientIP: '',
      endpoint: '',
    provider: '',
    timeRange: '7d',
    source: '',
    statusCode: '',
    isStream: '',
      sessionHash: '',
      userId: '',
      tokenHash: '',
      sessionFilter: '',
      conversationId: '',
      groupByConversation: false,
      page: 1,
      limit: 50,
    });
  };

  // 페이지 변경 핸들러
  const handlePageChange = (newPage) => {
    setFilters((prev) => ({
      ...prev,
      page: newPage,
    }));
  };

  const getClientToolLabel = (log) => {
    if (!log) return 'Unknown';
    if (log.clientTool && log.clientTool !== 'Unknown') {
      return log.clientTool;
    }
    if (log.xClientName) return log.xClientName;
    if (log.userAgent && log.userAgent !== 'unknown') return log.userAgent;
    return 'Unknown';
  };

  // 클라이언트 도구 아이콘
  const getClientToolIcon = (clientTool) => {
    const tool = clientTool?.toLowerCase() || '';
    if (tool.includes('vscode') || tool.includes('continue'))
      return <Code className='h-4 w-4' />;
    if (tool.includes('cursor')) return <Code className='h-4 w-4' />;
    if (
      tool.includes('chrome') ||
      tool.includes('firefox') ||
      tool.includes('safari')
    )
      return <Globe className='h-4 w-4' />;
    if (tool.includes('postman') || tool.includes('insomnia'))
      return <Database className='h-4 w-4' />;
    if (tool.includes('python') || tool.includes('node'))
      return <Code className='h-4 w-4' />;
    return <Monitor className='h-4 w-4' />;
  };

  // 상태 코드 아이콘
  const getStatusIcon = (statusCode) => {
    if (statusCode >= 200 && statusCode < 300)
      return <CheckCircle className='h-4 w-4 text-primary' />;
    if (statusCode >= 400 && statusCode < 500)
      return <AlertTriangle className='h-4 w-4 text-muted-foreground' />;
    if (statusCode >= 500) return <XCircle className='h-4 w-4 text-destructive' />;
    return <Info className='h-4 w-4 text-muted-foreground' />;
  };

  const getSourceBadge = (source) => {
    if (source === 'external') {
      return 'bg-primary/10 text-primary';
    }
    return 'bg-muted text-muted-foreground';
  };

  const getSourceLabel = (source) => {
    if (source === 'external') return t('admin_api_logs.source_external');
    return t('admin_api_logs.source_internal');
  };

  // 응답 시간 색상
  const getResponseTimeColor = (responseTime) => {
    if (responseTime < 1000) return 'text-primary';
    if (responseTime < 5000) return 'text-muted-foreground';
    return 'text-destructive';
  };

  // 시간 포맷팅
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
    });
  };

  // 토큰 수 포맷팅
  const formatTokens = (count) => {
    if (count > 1000) return `${(count / 1000).toFixed(1)}K`;
    return count?.toString() || '0';
  };

  // 프롬프트 전체 보기
  const openPromptModal = (log) => {
    setPromptModal({ isOpen: true, log });
  };

  const closePromptModal = () => {
    setPromptModal({ isOpen: false, log: null });
  };

  // 프롬프트 복사
  const copyPrompt = async (prompt) => {
    try {
      await navigator.clipboard.writeText(
        typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2)
      );
      alert(t('admin_api_logs.prompt_copied'), 'success', t('admin_api_logs.copy_complete'));
    } catch (error) {
      logger.error('복사 실패:', error);
    }
  };

  // 로그 펼치기/접기 토글
  const toggleLogExpansion = (logId) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  // 대화 세션 펼치기/접기 토글
  const toggleConversationExpansion = (conversationId) => {
    setExpandedConversations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  };

  // 메시지 목록 펼치기/접기 토글
  const toggleMessagesExpansion = (logId) => {
    setExpandedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  // 개별 메시지 내용 펼치기/접기 토글
  const toggleMessageContentExpansion = (logId, messageIndex) => {
    const key = `${logId}-${messageIndex}`;
    setExpandedMessageContents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // JSON 데이터 복사
  const copyJson = async (data) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      alert(t('admin_api_logs.json_copied'), 'success', t('admin_api_logs.copy_complete'));
    } catch (error) {
      logger.error('복사 실패:', error);
    }
  };

  // content 파싱 헬퍼 함수 (JSON 문자열이면 파싱)
  const parseContent = (content) => {
    if (typeof content !== 'string') {
      return content;
    }

    // JSON 문자열인지 확인하고 파싱 시도
    try {
      const trimmed = content.trim();
      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        const parsed = JSON.parse(trimmed);
        return parsed;
      }
    } catch (e) {
      return content;
    }

    return content;
  };

  // content를 보기 좋게 표시하는 헬퍼 함수
  const renderContent = (content) => {
    const parsed = parseContent(content);

    if (typeof parsed === 'string') {
      return parsed;
    }

    return JSON.stringify(parsed, null, 2);
  };

  return (
    <div className='space-y-6'>
      <div className='sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border pb-4 mb-2'>
        <PageHead
          eyebrow='외부 API'
          title={t('admin_api_logs.title')}
          sub={t('admin_api_logs.subtitle')}
          actions={
            <button
              onClick={() => fetchLogs()}
              disabled={loading}
              className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none gap-2'
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('admin_api_logs.refresh')}
            </button>
          }
        />
      </div>

      {/* 통계 카드 */}
      {stats.overall && (
        <div className='grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4'>
          <div className='bg-card border border-border rounded-xl shadow-sm p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  {t('admin_api_logs.total_requests')}
                </p>
                <p className='text-2xl font-bold text-foreground'>
                  {stats.overall.totalRequests?.toLocaleString() || 0}
                </p>
              </div>
              <Activity className='h-8 w-8 text-primary' />
            </div>
          </div>

          <div className='bg-card border border-border rounded-xl shadow-sm p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  {t('admin_api_logs.total_tokens')}
                </p>
                <p className='text-2xl font-bold text-foreground'>
                  {formatTokens(stats.overall.totalTokens)}
                </p>
              </div>
              <Zap className='h-8 w-8 text-muted-foreground' />
            </div>
          </div>

          <div className='bg-card border border-border rounded-xl shadow-sm p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  {t('admin_api_logs.avg_first_response')}
                </p>
                <p className='text-2xl font-bold text-foreground'>
                  {Math.round(stats.overall.avgFirstResponseTime || 0)}ms
                </p>
                <p className='text-xs text-muted-foreground mt-1'>
                  {t('admin_api_logs.first_response_basis')}
                </p>
              </div>
              <Clock className='h-8 w-8 text-primary' />
            </div>
          </div>

          <div className='bg-card border border-border rounded-xl shadow-sm p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  {t('admin_api_logs.avg_final_response')}
                </p>
                <p className='text-2xl font-bold text-foreground'>
                  {Math.round(stats.overall.avgFinalResponseTime || 0)}ms
                </p>
              </div>
              <Clock className='h-8 w-8 text-primary' />
            </div>
          </div>

          <div className='bg-card border border-border rounded-xl shadow-sm p-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm text-muted-foreground'>
                  {t('admin_api_logs.success_rate')}
                </p>
                <p className='text-2xl font-bold text-foreground'>
                  {stats.overall.totalRequests > 0
                    ? Math.round(
                        (stats.overall.successRequests /
                          stats.overall.totalRequests) *
                          100
                      )
                    : 0}
                  %
                </p>
              </div>
              <BarChart3 className='h-8 w-8 text-primary' />
            </div>
          </div>
        </div>
      )}

      {/* 상세 통계 토글 버튼 */}
      {stats.byEndpoint && stats.byEndpoint.length > 0 && (
        <button
          onClick={() => setShowDetailedStats(!showDetailedStats)}
          className='w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-accent rounded-lg transition-colors'
        >
          <span className='text-sm font-medium text-foreground'>
            {showDetailedStats ? t('admin_api_logs.detailed_stats_hide') : t('admin_api_logs.detailed_stats_show')}
          </span>
          {showDetailedStats ? (
            <ChevronUp className='h-4 w-4 text-muted-foreground' />
          ) : (
            <ChevronDown className='h-4 w-4 text-muted-foreground' />
          )}
        </button>
      )}

      {/* 엔드포인트 통계 (상위 8개) */}
      {showDetailedStats &&
        Array.isArray(stats.byEndpoint) &&
        stats.byEndpoint.length > 0 && (
          <div className='bg-card border border-border rounded-xl shadow-sm p-4'>
            <div className='flex items-center justify-between mb-3'>
              <h3 className='font-medium text-foreground'>
                {t('admin_api_logs.endpoint_stats')}
              </h3>
              <span className='text-xs text-muted-foreground'>
                {t('admin_api_logs.top_n_of_total', { total: stats.byEndpoint.length, top: 8 })}
              </span>
            </div>
            <div className='space-y-2'>
              {stats.byEndpoint.slice(0, 8).map((ep) => (
                <div
                  key={ep._id || 'unknown'}
                  className='flex items-center justify-between text-sm'
                >
                  <div className='truncate max-w-[70%]'>
                    <span className='font-mono text-foreground'>
                      {ep._id || '(unknown)'}
                    </span>
                  </div>
                  <div className='flex items-center gap-4 text-muted-foreground'>
                    <span>
                      {t('admin_api_logs.count_label')}{' '}
                      <strong className='text-foreground'>
                        {ep.count}
                      </strong>
                    </span>
                    <span>
                      {t('admin_api_logs.avg_first_final')}{' '}
                      <strong className='text-foreground'>
                        {Math.round(ep.avgFirstResponseTime || 0)}ms /{' '}
                        {Math.round(ep.avgFinalResponseTime || 0)}ms
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* 필터 */}
      <div className='bg-card border border-border rounded-xl shadow-sm'>
        <div className='flex items-center justify-between px-4 py-3 border-b border-border'>
          <div className='flex items-center gap-3'>
            <Filter className='h-5 w-5 text-primary' />
            <h3 className='font-semibold text-foreground'>
              {t('admin_api_logs.filter')}
            </h3>
          </div>
          <div className='flex items-center gap-2'>
            <button
              onClick={handleResetFilters}
              className='px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors'
            >
              {t('admin_api_logs.reset')}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className='px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-md transition-colors flex items-center gap-1'
            >
              {showFilters ? (
                <>
                  <ChevronUp className='h-4 w-4' />
                  {t('admin_api_logs.hide')}
                </>
              ) : (
                <>
                  <ChevronDown className='h-4 w-4' />
                  {t('admin_api_logs.expand')}
                </>
              )}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className='p-4'>
            {/* 기본 필터 */}
            <div className='space-y-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1.5'>
                    {t('admin_api_logs.time_range')}
                  </label>
                  <select
                    value={filters.timeRange}
                    onChange={(e) =>
                      handleFilterChange('timeRange', e.target.value)
                    }
                    className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent'
                  >
                    <option value='1h'>{t('admin_api_logs.last_1h')}</option>
                    <option value='6h'>{t('admin_api_logs.last_6h')}</option>
                    <option value='24h'>{t('admin_api_logs.last_24h')}</option>
                    <option value='7d'>{t('admin_api_logs.last_7d')}</option>
                    <option value='30d'>{t('admin_api_logs.last_30d')}</option>
                    <option value='custom'>{t('admin_api_logs.custom_range')}</option>
                  </select>
                </div>
                {filters.timeRange === 'custom' && (
                  <div className='md:col-span-2 lg:col-span-5'>
                    <label className='block text-sm font-medium text-foreground mb-1.5'>
                      {t('admin_api_logs.custom_range')}
                    </label>
                    <div className='flex items-center gap-3 flex-wrap'>
                      <input
                        type='date'
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        onClick={(e) => e.currentTarget.showPicker?.()}
                        className='px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent min-w-[140px]'
                        placeholder={t('admin_api_logs.start_date')}
                      />
                      <span className='text-sm text-muted-foreground'>~</span>
                      <input
                        type='date'
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        onClick={(e) => e.currentTarget.showPicker?.()}
                        className='px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent min-w-[140px]'
                        placeholder={t('admin_api_logs.end_date')}
                      />
                      <button
                        onClick={() => fetchLogs(true)}
                        className='px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium'
                      >
                        {t('admin_api_logs.search')}
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className='block text-sm font-medium text-foreground mb-1.5'>
                    {t('admin_api_logs.category')}
                  </label>
                  <select
                    value={filters.source}
                    onChange={(e) =>
                      handleFilterChange('source', e.target.value)
                    }
                    className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent'
                  >
                    <option value=''>{t('admin_api_logs.all')}</option>
                    <option value='external'>{t('admin_api_logs.external_api')}</option>
                    <option value='internal'>{t('admin_api_logs.internal_api')}</option>
                  </select>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-1.5'>
                    {t('admin_api_logs.api_type')}
                  </label>
                  <select
                    value={filters.apiType}
                    onChange={(e) =>
                      handleFilterChange('apiType', e.target.value)
                    }
                    className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent'
                  >
                    <option value=''>{t('admin_api_logs.all')}</option>
                    <option value='generate'>Generate</option>
                    <option value='chat'>Chat</option>
                    <option value='image-analysis'>Image Analysis</option>
                  </select>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-1.5'>
                    Provider
                  </label>
                  <select
                    value={filters.provider}
                    onChange={(e) =>
                      handleFilterChange('provider', e.target.value)
                    }
                    className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent'
                  >
                    <option key='all-provider' value=''>
                      {t('admin_api_logs.all')}
                    </option>
                    {(stats.byProvider || [])
                      .filter((p) => p._id)
                      .map((p, index) => (
                        <option key={p._id || `provider-${index}`} value={p._id}>
                          {p._id} ({p.count})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className='block text-sm font-medium text-foreground mb-1.5'>
                    {t('admin_api_logs.client_tool')}
                  </label>
                  <select
                    value={filters.clientTool}
                    onChange={(e) =>
                      handleFilterChange('clientTool', e.target.value)
                    }
                    className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent'
                  >
                    <option key='all' value=''>
                      {t('admin_api_logs.all')}
                    </option>
                    {stats.byClientTool?.map((tool, index) => (
                      <option
                        key={tool._id || `client-tool-${index}`}
                        value={tool._id}
                      >
                        {tool._id} ({tool.count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1.5'>
                    {t('admin_api_logs.model_search')}
                  </label>
                  <input
                    type='text'
                    placeholder={t('admin_api_logs.model_search_placeholder')}
                    value={filters.model}
                    onChange={(e) => handleFilterChange('model', e.target.value)}
                    className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground'
                  />
                </div>

                <div className='flex items-end'>
                  <label className='flex items-center gap-2 cursor-pointer px-3 py-2 hover:bg-accent rounded-lg transition-colors'>
                    <input
                      type='checkbox'
                      checked={filters.groupByConversation}
                      onChange={(e) =>
                        handleFilterChange(
                          'groupByConversation',
                          e.target.checked
                        )
                      }
                      className='w-4 h-4 text-primary border-border rounded focus:ring-ring'
                    />
                    <span className='text-sm font-medium text-foreground'>
                      {t('admin_api_logs.group_by_conversation')}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* 고급 필터 (디버깅용) */}
            <div className='mt-4 pt-4 border-t border-border'>
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className='flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors'
              >
                {showAdvancedFilters ? (
                  <ChevronUp className='h-4 w-4' />
                ) : (
                  <ChevronDown className='h-4 w-4' />
                )}
                {t('admin_api_logs.advanced_filters')}
              </button>

              {showAdvancedFilters && (
                <div className='mt-4 space-y-4'>
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-foreground mb-1.5'>
                        {t('admin_api_logs.ip_address')}
                      </label>
                      <input
                        type='text'
                        placeholder={t('admin_api_logs.ip_placeholder')}
                        value={filters.clientIP}
                        onChange={(e) =>
                          handleFilterChange('clientIP', e.target.value)
                        }
                        className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:border-transparent'
                      />
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-foreground mb-1.5'>
                        Session Hash
                      </label>
                      <input
                        type='text'
                        placeholder={t('admin_api_logs.session_hash_placeholder')}
                        value={filters.sessionHash}
                        onChange={(e) =>
                          handleFilterChange('sessionHash', e.target.value)
                        }
                        className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:border-transparent'
                      />
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-foreground mb-1.5'>
                        User ID
                      </label>
                      <input
                        type='text'
                        placeholder={t('admin_api_logs.user_id_placeholder')}
                        value={filters.userId}
                        onChange={(e) =>
                          handleFilterChange('userId', e.target.value)
                        }
                        className='w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground font-mono text-sm focus:ring-2 focus:ring-ring focus:border-transparent'
                      />
                    </div>
                  </div>
                  
                  <p className='text-xs text-muted-foreground italic'>
                    {t('admin_api_logs.advanced_filters_note')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 로그 테이블 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='font-medium text-foreground'>
            {t('admin_api_logs.log_records', { count: pagination.totalCount?.toLocaleString() || 0 })}
            {pagination.totalPages > 1 && (
              <span className='ml-2 text-sm text-muted-foreground font-normal'>
                {t('admin_api_logs.page_info', { page: pagination.page, totalPages: pagination.totalPages })}
              </span>
            )}
          </h3>
        </div>

        {loading ? (
          <div className='flex items-center justify-center py-8'>
            <RefreshCw className='h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        ) : logs.length === 0 ? (
          <div className='text-center py-8 text-muted-foreground'>
            {t('admin_api_logs.no_logs')}
          </div>
        ) : filters.groupByConversation ? (
          // 그룹화된 뷰
          <div className='space-y-4'>
            {logs.map((conversation, index) => {
              const isExpanded = expandedConversations.has(
                conversation.conversationId
              );
              const conversationLogs = conversation.logs || [];
              // 고유 key 생성: conversationId가 없거나 중복될 수 있으므로 첫 번째 로그의 _id와 조합
              const uniqueKey = conversation.conversationId
                ? `${conversation.conversationId}-${
                    conversationLogs[0]?._id || index
                  }`
                : `no-conversation-${conversationLogs[0]?._id || index}`;
              return (
                <div
                  key={uniqueKey}
                  className='border border-primary/30 rounded-lg overflow-hidden bg-primary/5'
                >
                  {/* 대화 세션 헤더 */}
                  <div
                    className='p-4 cursor-pointer hover:bg-accent transition-colors'
                    onClick={() =>
                      toggleConversationExpansion(conversation.conversationId)
                    }
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-3 flex-1'>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleConversationExpansion(
                              conversation.conversationId
                            );
                          }}
                          className='p-1 hover:bg-accent rounded transition-colors'
                        >
                          {isExpanded ? (
                            <ChevronUp className='h-4 w-4 text-primary' />
                          ) : (
                            <ChevronDown className='h-4 w-4 text-primary' />
                          )}
                        </button>
                        <div className='flex items-center gap-2'>
                          <Hash className='h-4 w-4 text-primary' />
                          <span className='text-sm font-mono text-primary'>
                            {conversation.conversationId || 'no-conversation'}
                          </span>
                        </div>
                        <span className='text-xs text-muted-foreground'>
                          {t('admin_api_logs.requests_count', { count: conversation.totalRequests })}
                        </span>
                        <span className='text-xs text-muted-foreground'>
                          {formatTokens(conversation.totalTokens)} {t('admin_api_logs.tokens_label')}
                        </span>
                      </div>
                      <div className='text-right text-xs text-muted-foreground'>
                        <div>{formatTime(conversation.startTime)}</div>
                        <div>~ {formatTime(conversation.endTime)}</div>
                      </div>
                    </div>
                    {conversation.firstMessage && (
                      <div className='mt-2 text-sm text-foreground truncate'>
                        {conversation.firstMessage}...
                      </div>
                    )}
                  </div>

                  {/* 대화 세션 내 로그 목록 */}
                  {isExpanded && (
                    <div className='border-t border-primary/30 bg-card'>
                      <div className='p-2 space-y-2'>
                        {conversationLogs.map((log) => {
                          const isLogExpanded = expandedLogs.has(log._id);
                          return (
                            <div
                              key={log._id}
                              className='border border-border rounded-lg p-3 hover:bg-accent transition-colors'
                            >
                              <div
                                className='flex items-start justify-between mb-2 cursor-pointer'
                                onClick={() => toggleLogExpansion(log._id)}
                              >
                                <div className='flex items-center gap-2 flex-1 flex-wrap'>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLogExpansion(log._id);
                                    }}
                                    className='p-1 hover:bg-accent rounded transition-colors'
                                  >
                                    {isLogExpanded ? (
                                      <ChevronUp className='h-3 w-3 text-muted-foreground' />
                                    ) : (
                                      <ChevronDown className='h-3 w-3 text-muted-foreground' />
                                    )}
                                  </button>
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      log.apiType === 'generate'
                                        ? 'bg-primary/10 text-primary'
                                        : log.apiType === 'image-analysis'
                                          ? 'bg-muted text-muted-foreground'
                                          : 'bg-primary/10 text-primary'
                                    }`}
                                  >
                                    {log.apiType?.toUpperCase()}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${getSourceBadge(
                                      log.source
                                    )}`}
                                  >
                                    {getSourceLabel(log.source)}
                                  </span>
                                  <div className='flex items-center gap-1'>
                                    {getStatusIcon(log.statusCode)}
                                    <span className='text-xs'>
                                      {log.statusCode}
                                    </span>
                                  </div>
                                  {(log.userName || log.userEmail) && (
                                    <span className='text-xs text-foreground font-medium'>
                                      {log.userName || log.userEmail}
                                    </span>
                                  )}
                                  <span className='text-xs text-muted-foreground'>•</span>
                                  <span className='text-xs text-muted-foreground'>
                                    {log.modelLabel || log.model}
                                  </span>
                                  <span className='text-xs text-muted-foreground'>•</span>
                                  <span className='text-xs text-muted-foreground'>
                                    {formatTime(log.timestamp)}
                                  </span>
                                  <span className='text-xs text-muted-foreground'>•</span>
                                  <span
                                    className={`text-xs font-medium ${getResponseTimeColor(
                                      log.finalResponseTime ?? log.responseTime
                                    )}`}
                                  >
                                    {log.firstResponseTime ?? log.responseTime}ms /{' '}
                                    {log.finalResponseTime ?? log.responseTime}ms
                                  </span>
                                </div>
                              </div>
                              {isLogExpanded && (
                                <div className='mt-3 pt-3 border-t border-border space-y-4'>
                                  {/* 기본 정보 그리드 */}
                                  <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                                    {/* 클라이언트 정보 */}
                                    <div>
                                      <div className='text-xs font-semibold text-muted-foreground mb-2'>
                                        {t('admin_api_logs.client_label')}
                                      </div>
                                      <div className='flex items-center gap-2 mb-1'>
                                        {getClientToolIcon(
                                          getClientToolLabel(log)
                                        )}
                                        <span className='text-sm font-medium text-foreground'>
                                          {getClientToolLabel(log)}
                                        </span>
                                      </div>
                                      <div className='text-xs text-muted-foreground'>
                                        {log.clientIP}
                                      </div>
                                    </div>

                                    {/* 사용자 & 설정 정보 */}
                                    <div>
                                      <div className='text-xs font-semibold text-muted-foreground mb-2'>
                                        {t('admin_api_logs.user_settings')}
                                      </div>
                                      <div className='text-sm space-y-1'>
                                        {log.userName || log.userEmail ? (
                                          <div className='text-foreground'>
                                            {log.userName || t('admin_api_logs.no_name')} (
                                            {log.userEmail || t('admin_api_logs.no_email')})
                                            {log.userDepartment && (
                                              <span className='ml-2 text-xs text-muted-foreground'>
                                                [{log.userDepartment.replaceAll('부서', '그룹')}]
                                              </span>
                                            )}
                                          </div>
                                        ) : null}
                                        <div className='text-xs text-muted-foreground space-y-1'>
                                          {log.tokenName && (
                                            <div>
                                              <strong>{t('admin_api_logs.token_colon')}</strong>{' '}
                                              {log.tokenName}
                                            </div>
                                          )}
                                          <div>
                                            <strong>{t('admin_api_logs.model_colon')}</strong>{' '}
                                            {log.modelLabel || log.model}
                                          </div>
                                          {log.sessionHash && (
                                            <div className='flex items-center gap-2'>
                                              <strong>{t('admin_api_logs.session_colon')}</strong>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleFilterChange(
                                                    'sessionFilter',
                                                    'exact'
                                                  );
                                                  handleFilterChange(
                                                    'sessionHash',
                                                    log.sessionHash
                                                  );
                                                  handleFilterChange(
                                                    'userId',
                                                    log.userId || ''
                                                  );
                                                  handleFilterChange(
                                                    'tokenHash',
                                                    log.tokenHash || ''
                                                  );
                                                }}
                                                className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors font-mono'
                                                title={t('admin_api_logs.view_session_requests')}
                                              >
                                                <Hash className='h-3 w-3' />
                                                {log.sessionHash.substring(
                                                  0,
                                                  8
                                                )}
                                                ...
                                              </button>
                                            </div>
                                          )}
                                          {log.userId && (
                                            <div className='flex items-center gap-2'>
                                              <strong>{t('admin_api_logs.user_colon')}</strong>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleFilterChange(
                                                    'sessionFilter',
                                                    'user'
                                                  );
                                                  handleFilterChange(
                                                    'userId',
                                                    log.userId
                                                  );
                                                  handleFilterChange(
                                                    'tokenHash',
                                                    log.tokenHash || ''
                                                  );
                                                }}
                                                className='inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors font-mono'
                                                title={t('admin_api_logs.view_user_requests')}
                                              >
                                                {log.userId.substring(0, 8)}...
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* 토큰 사용량 */}
                                    <div>
                                      <div className='text-xs font-semibold text-muted-foreground mb-2'>
                                        {t('admin_api_logs.token_usage')}
                                      </div>
                                      <div className='text-sm text-muted-foreground space-y-1'>
                                        <div className='flex justify-between'>
                                          <span>{t('admin_api_logs.input_label')}</span>
                                          <span className='font-medium text-foreground'>
                                            {formatTokens(log.promptTokenCount)}
                                          </span>
                                        </div>
                                        <div className='flex justify-between'>
                                          <span>{t('admin_api_logs.output_label')}</span>
                                          <span className='font-medium text-foreground'>
                                            {formatTokens(
                                              log.responseTokenCount
                                            )}
                                          </span>
                                        </div>
                                        <div className='flex justify-between border-t border-border pt-1'>
                                          <span>
                                            <strong>{t('admin_api_logs.total_sum')}:</strong>
                                          </span>
                                          <span className='font-bold text-foreground'>
                                            {formatTokens(log.totalTokenCount)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 프롬프트 미리보기 */}
                                  {log.prompt && (
                                    <div className='pt-3 border-t border-border'>
                                      <div className='flex items-start justify-between'>
                                        <p className='text-sm text-muted-foreground flex-1'>
                                          <strong>{t('admin_api_logs.prompt_label')}</strong>{' '}
                                          {typeof log.prompt === 'string'
                                            ? log.prompt.length > 100
                                              ? log.prompt.substring(0, 100) +
                                                '...'
                                              : log.prompt
                                            : t('admin_api_logs.message_array')}
                                        </p>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openPromptModal(log);
                                          }}
                                          className='ml-2 p-1 text-primary hover:text-primary'
                                          title={t('admin_api_logs.view_full_prompt')}
                                        >
                                          <Eye className='h-4 w-4' />
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* 메시지 정보 */}
                                  {log.messages &&
                                    Array.isArray(log.messages) &&
                                    log.messages.length > 0 && (
                                      <div className='pt-3 border-t border-border'>
                                        <div className='text-xs font-semibold text-muted-foreground mb-2'>
                                          {t('admin_api_logs.messages_count', { count: log.messages.length })}
                                        </div>
                                        <div className='space-y-2 max-h-64 overflow-y-auto'>
                                          {(() => {
                                            const isMessagesExpanded =
                                              expandedMessages.has(log._id);
                                            const displayMessages =
                                              isMessagesExpanded
                                                ? log.messages
                                                : log.messages.slice(-3);

                                            return (
                                              <>
                                                {!isMessagesExpanded &&
                                                  log.messages.length > 3 && (
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleMessagesExpansion(
                                                          log._id
                                                        );
                                                      }}
                                                      className='w-full text-xs text-primary hover:text-primary text-center py-2 px-3 rounded-md hover:bg-primary/10 transition-colors'
                                                    >
                                                      {t('admin_api_logs.view_previous_messages', { count: log.messages.length - 3 })}
                                                    </button>
                                                  )}
                                                {isMessagesExpanded &&
                                                  log.messages.length > 3 && (
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleMessagesExpansion(
                                                          log._id
                                                        );
                                                      }}
                                                      className='w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 px-3 rounded-md hover:bg-accent transition-colors'
                                                    >
                                                      {t('admin_api_logs.show_latest_3')}
                                                    </button>
                                                  )}
                                                {displayMessages.map(
                                                  (msg, idx) => {
                                                    const originalIdx =
                                                      isMessagesExpanded
                                                        ? idx
                                                        : log.messages.length -
                                                          3 +
                                                          idx;
                                                    const messageKey = `${log._id}-${originalIdx}`;
                                                    const isContentExpanded =
                                                      expandedMessageContents.has(
                                                        messageKey
                                                      );
                                                    // 메시지 내용 추출 (다양한 형식 지원)
                                                    let contentStr = '';
                                                    if (typeof msg === 'string') {
                                                      contentStr = msg;
                                                    } else if (msg.content) {
                                                      contentStr = typeof msg.content === 'string' 
                                                        ? msg.content 
                                                        : JSON.stringify(msg.content, null, 2);
                                                    } else if (msg.text) {
                                                      contentStr = typeof msg.text === 'string' 
                                                        ? msg.text 
                                                        : JSON.stringify(msg.text, null, 2);
                                                    } else if (msg.message) {
                                                      contentStr = typeof msg.message === 'string' 
                                                        ? msg.message 
                                                        : JSON.stringify(msg.message, null, 2);
                                                    } else {
                                                      // 객체 전체를 표시
                                                      contentStr = JSON.stringify(msg, null, 2);
                                                    }
                                                    const shouldTruncate =
                                                      contentStr.length > 150;

                                                    return (
                                                      <div
                                                        key={originalIdx}
                                                        className='bg-muted rounded p-2 text-xs'
                                                      >
                                                        <div className='font-semibold text-foreground mb-1'>
                                                          {(() => {
                                                            const role = typeof msg === 'object' && msg !== null 
                                                              ? (msg.role || msg.type || 'unknown')
                                                              : 'unknown';
                                                            if (role === 'user') return '👤 User';
                                                            if (role === 'assistant') return '🤖 Assistant';
                                                            if (role === 'system') return '⚙️ System';
                                                            return `📝 ${role}`;
                                                          })()}
                                                        </div>
                                                        <div className='text-muted-foreground whitespace-pre-wrap break-words'>
                                                          {shouldTruncate &&
                                                          !isContentExpanded
                                                            ? contentStr.substring(
                                                                0,
                                                                150
                                                              ) + '...'
                                                            : contentStr}
                                                        </div>
                                                        {shouldTruncate && (
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              toggleMessageContentExpansion(
                                                                log._id,
                                                                originalIdx
                                                              );
                                                            }}
                                                            className='mt-1 text-primary hover:text-primary text-xs underline'
                                                          >
                                                            {isContentExpanded
                                                              ? t('admin_api_logs.fold')
                                                              : t('admin_api_logs.view_all')}
                                                          </button>
                                                        )}
                                                      </div>
                                                    );
                                                  }
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    )}

                                  {/* 오류 메시지 */}
                                  {log.error && (
                                    <div className='pt-3 border-t border-destructive/30'>
                                      <p className='text-sm text-destructive'>
                                        <strong>{t('admin_api_logs.error_label')}</strong> {log.error}
                                      </p>
                                    </div>
                                  )}

                                  {/* HTTP Request/Response 상세 정보 */}
                                  <div className='pt-3 border-t border-border space-y-4'>
                                    {/* HTTP Request 정보 */}
                                    <div>
                                      <div className='flex items-center justify-between mb-2'>
                                        <h4 className='font-medium text-foreground flex items-center gap-2 text-sm'>
                                          <span className='px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono'>
                                            POST
                                          </span>
                                          HTTP Request
                                        </h4>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const requestData = {
                                              method: 'POST',
                                              url:
                                                log.endpoint ||
                                                '/api/v1/chat/completions',
                                              headers: {
                                                'Content-Type':
                                                  'application/json',
                                                Authorization:
                                                  log.authorization ===
                                                  'present'
                                                    ? 'Bearer ***'
                                                    : undefined,
                                                'User-Agent': log.userAgent,
                                                'Accept-Language':
                                                  log.acceptLanguage,
                                                Origin: log.origin,
                                                Referer: log.referer,
                                              },
                                              body: {
                                                model: log.model,
                                                messages:
                                                  log.messages ||
                                                  (log.prompt
                                                    ? [
                                                        {
                                                          role: 'user',
                                                          content: log.prompt,
                                                        },
                                                      ]
                                                    : []),
                                                stream: log.isStream,
                                              },
                                            };
                                            copyJson(requestData);
                                          }}
                                          className='flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded transition-colors'
                                          title={t('admin_api_logs.copy_request')}
                                        >
                                          <Copy className='h-3 w-3' />
                                          {t('admin_api_logs.copy_request')}
                                        </button>
                                      </div>

                                      <div className='bg-muted rounded-lg p-3 space-y-2'>
                                        {/* URL */}
                                        <div>
                                          <div className='text-xs font-semibold text-foreground mb-1'>
                                            URL
                                          </div>
                                          <div className='text-xs font-mono text-foreground bg-card p-2 rounded border border-border'>
                                            {log.endpoint ||
                                              '/api/v1/chat/completions'}
                                          </div>
                                        </div>

                                        {/* Request Body */}
                                        <div>
                                          <div className='text-xs font-semibold text-foreground mb-1'>
                                            Request Body
                                          </div>
                                          <div className='bg-card p-2 rounded border border-border max-h-48 overflow-y-auto'>
                                            <pre className='text-xs font-mono text-foreground whitespace-pre-wrap break-words'>
                                              {log.requestBody
                                                ? JSON.stringify(
                                                    log.requestBody,
                                                    null,
                                                    2
                                                  )
                                                : JSON.stringify(
                                                    {
                                                      model: log.model,
                                                      ...(log.messages &&
                                                      Array.isArray(
                                                        log.messages
                                                      )
                                                        ? {
                                                            messages:
                                                              log.messages.map(
                                                                (msg) => ({
                                                                  role: msg.role,
                                                                  content:
                                                                    parseContent(
                                                                      msg.content
                                                                    ),
                                                                })
                                                              ),
                                                          }
                                                        : {}),
                                                      ...(log.prompt
                                                        ? { prompt: log.prompt }
                                                        : {}),
                                                      stream: log.isStream,
                                                    },
                                                    null,
                                                    2
                                                  )}
                                            </pre>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* HTTP Response 정보 */}
                                    <div>
                                      <div className='flex items-center justify-between mb-2'>
                                        <h4 className='font-medium text-foreground flex items-center gap-2 text-sm'>
                                          <span
                                            className={`px-2 py-0.5 rounded text-xs font-mono ${
                                              log.statusCode >= 200 &&
                                              log.statusCode < 300
                                                ? 'bg-primary/10 text-primary'
                                                : log.statusCode >= 400 &&
                                                  log.statusCode < 500
                                                ? 'bg-muted text-muted-foreground'
                                                : 'bg-destructive/10 text-destructive'
                                            }`}
                                          >
                                            {log.statusCode}
                                          </span>
                                          HTTP Response
                                        </h4>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const responseData = {
                                              status: log.statusCode,
                                              statusText:
                                                log.statusCode >= 200 &&
                                                log.statusCode < 300
                                                  ? 'OK'
                                                  : 'Error',
                                              headers: log.responseHeaders || {
                                                'Content-Type': log.isStream
                                                  ? 'text/event-stream'
                                                  : 'application/json',
                                              },
                                              body:
                                                log.responseBody ||
                                                log.error ||
                                                (log.messages
                                                  ? 'Streaming response'
                                                  : 'Response content'),
                                              usage: {
                                                prompt_tokens:
                                                  log.promptTokenCount,
                                                completion_tokens:
                                                  log.responseTokenCount,
                                                total_tokens:
                                                  log.totalTokenCount,
                                              },
                                            };
                                            copyJson(responseData);
                                          }}
                                          className='flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded transition-colors'
                                          title={t('admin_api_logs.copy_response')}
                                        >
                                          <Copy className='h-3 w-3' />
                                          {t('admin_api_logs.copy_response')}
                                        </button>
                                      </div>

                                      <div className='bg-muted rounded-lg p-3 space-y-2'>
                                        {/* Response Body / Error */}
                                        <div>
                                          <div className='text-xs font-semibold text-foreground mb-1'>
                                            {log.error
                                              ? 'Error Message'
                                              : 'Response Body'}
                                          </div>
                                          <div
                                            className={`bg-card p-2 rounded border border-border max-h-48 overflow-y-auto ${
                                              log.error
                                                ? 'border-destructive/30'
                                                : ''
                                            }`}
                                          >
                                            <pre
                                              className={`text-xs font-mono whitespace-pre-wrap break-words ${
                                                log.error
                                                  ? 'text-destructive'
                                                  : 'text-foreground'
                                              }`}
                                            >
                                              {log.error
                                                ? log.error
                                                : log.responseBody
                                                ? JSON.stringify(
                                                    log.responseBody,
                                                    null,
                                                    2
                                                  )
                                                : log.messages &&
                                                  Array.isArray(log.messages)
                                                ? t('admin_api_logs.streaming_response_array')
                                                : 'Response content'}
                                            </pre>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // 기존 개별 로그 뷰
          <div className='space-y-2'>
            {logs.map((log, index) => {
              const isExpanded = expandedLogs.has(log._id);
              // 고유 key 생성: _id가 없거나 중복될 수 있으므로 index와 조합
              const uniqueKey = log._id
                ? `log-${log._id}-${index}`
                : `log-${index}`;
              return (
                <div
                  key={uniqueKey}
                  className='border border-border rounded-lg hover:bg-accent transition-colors'
                >
                  {/* 간결한 요약 헤더 */}
                  <div
                    className='flex items-start justify-between p-4 cursor-pointer'
                    onClick={() => toggleLogExpansion(log._id)}
                  >
                    <div className='flex items-center gap-3 flex-1'>
                      {/* 펼치기 아이콘 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLogExpansion(log._id);
                        }}
                        className='p-1 hover:bg-accent rounded transition-colors'
                      >
                        {isExpanded ? (
                          <ChevronUp className='h-4 w-4 text-muted-foreground' />
                        ) : (
                          <ChevronDown className='h-4 w-4 text-muted-foreground' />
                        )}
                      </button>

                      {/* API 타입 & 스트리밍 */}
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          log.apiType === 'generate'
                            ? 'bg-primary/10 text-primary'
                            : log.apiType === 'image-analysis'
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {log.apiType?.toUpperCase()} {log.isStream && 'STREAM'}
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getSourceBadge(
                          log.source
                        )}`}
                      >
                        {getSourceLabel(log.source)}
                      </span>

                      {/* 재시도 횟수 */}
                      {log.retryCount && log.retryCount > 1 && (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            log.retryCount === 2
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {t('admin_api_logs.retry_count', { count: log.retryCount })}
                        </span>
                      )}

                      {/* 상태 코드 */}
                      <div className='flex items-center gap-1'>
                        {getStatusIcon(log.statusCode)}
                        <span className='text-sm font-medium'>
                          {log.statusCode}
                        </span>
                      </div>

                       {/* 핵심 정보 한 줄에 */}
                       <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                         <span className='flex items-center gap-1'>
                           {getClientToolIcon(getClientToolLabel(log))}
                           {getClientToolLabel(log)}
                         </span>
                         {(log.userName || log.userEmail) && (
                           <>
                             <span>•</span>
                             <span className='text-foreground font-medium'>
                               {log.userName || log.userEmail}
                             </span>
                           </>
                         )}
                         <span>•</span>
                         <span>{log.modelLabel || log.model}</span>
                         <span>•</span>
                         <span className='font-medium'>
                           {formatTokens(log.totalTokenCount)} {t('admin_api_logs.tokens_label')}
                         </span>
                       </div>
                     </div>

                    <div className='text-right'>
                      <div className='text-xs text-muted-foreground'>
                        {formatTime(log.timestamp)}
                      </div>
                      <div
                        className={`text-sm font-medium ${getResponseTimeColor(
                          log.finalResponseTime ?? log.responseTime
                        )}`}
                      >
                        {log.firstResponseTime ?? log.responseTime}ms /{' '}
                        {log.finalResponseTime ?? log.responseTime}ms
                      </div>
                    </div>
                  </div>

                  {/* 오류 메시지 (항상 표시) */}
                  {log.error && !isExpanded && (
                    <div className='px-4 pb-4 border-t border-destructive/30 pt-3'>
                      <p className='text-sm text-destructive'>
                        <strong>{t('admin_api_logs.error_label')}</strong> {log.error}
                      </p>
                    </div>
                  )}

                  {/* 펼쳐진 상세 정보 */}
                  {isExpanded && (
                    <div className='border-t border-border bg-muted/50'>
                      <div className='p-4 space-y-4'>
                        {/* 사용자 & 세션 정보 */}
                        <div className='bg-card rounded-lg p-4 shadow-sm'>
                          <h4 className='text-sm font-semibold text-foreground mb-3'>
                            {t('admin_api_logs.request_info')}
                          </h4>
                          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm'>
                            <div className='space-y-2'>
                              <div>
                                <span className='text-muted-foreground'>
                                  {t('admin_api_logs.client_colon')}
                                </span>
                                <span className='ml-2 text-foreground font-medium'>
                                  {getClientToolLabel(log)}
                                </span>
                              </div>
                              <div>
                                <span className='text-muted-foreground'>
                                  {t('admin_api_logs.ip_colon')}
                                </span>
                                <span className='ml-2 text-foreground font-mono text-xs'>
                                  {log.clientIP}
                                </span>
                              </div>
                              {log.userName && (
                                <div>
                                  <span className='text-muted-foreground'>
                                    {t('admin_api_logs.user_colon')}
                                  </span>
                                  <span className='ml-2 text-foreground'>
                                    {log.userName} ({log.userEmail})
                                    {log.userDepartment && (
                                      <span className='ml-1 text-xs text-muted-foreground'>
                                        [{log.userDepartment.replaceAll('부서', '그룹')}]
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}
                              {log.tokenName && (
                                <div>
                                  <span className='text-muted-foreground'>
                                    {t('admin_api_logs.token_colon')}
                                  </span>
                                  <span className='ml-2 text-foreground'>
                                    {log.tokenName}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className='space-y-2'>
                              {log.sessionHash && (
                                <div className='flex items-center gap-2'>
                                  <span className='text-muted-foreground'>
                                    {t('admin_api_logs.session_colon')}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFilterChange(
                                        'sessionFilter',
                                        'exact'
                                      );
                                      handleFilterChange(
                                        'sessionHash',
                                        log.sessionHash
                                      );
                                      handleFilterChange(
                                        'userId',
                                        log.userId || ''
                                      );
                                      handleFilterChange(
                                        'tokenHash',
                                        log.tokenHash || ''
                                      );
                                    }}
                                    className='inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-mono transition-colors'
                                    title={t('admin_api_logs.view_session_requests')}
                                  >
                                    <Hash className='h-3 w-3' />
                                    {log.sessionHash.substring(0, 12)}...
                                  </button>
                                </div>
                              )}
                              {log.conversationId && (
                                <div className='flex items-center gap-2'>
                                  <span className='text-muted-foreground'>
                                    {t('admin_api_logs.conversation_colon')}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFilterChange(
                                        'conversationId',
                                        log.conversationId
                                      );
                                      handleFilterChange(
                                        'groupByConversation',
                                        false
                                      );
                                    }}
                                    className='inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-mono transition-colors'
                                    title={t('admin_api_logs.view_conversation_requests')}
                                  >
                                    <Hash className='h-3 w-3' />
                                    {log.conversationId.substring(0, 12)}...
                                  </button>
                                </div>
                              )}
                              <div>
                                <span className='text-muted-foreground'>
                                  {t('admin_api_logs.token_usage_colon')}
                                </span>
                                <span className='ml-2 text-foreground font-medium'>
                                  {formatTokens(log.promptTokenCount)} →{' '}
                                  {formatTokens(log.responseTokenCount)}
                                  <span className='ml-1 text-muted-foreground text-xs'>
                                    ({t('admin_api_logs.total_sum')} {formatTokens(log.totalTokenCount)})
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 메시지 정보 (있는 경우) */}
                        {log.messages &&
                          Array.isArray(log.messages) &&
                          log.messages.length > 0 && (
                            <div className='bg-card rounded-lg p-4 shadow-sm'>
                              <div className='flex items-center justify-between mb-3'>
                                <h4 className='text-sm font-semibold text-foreground'>
                                  {t('admin_api_logs.messages_count', { count: log.messages.length })}
                                </h4>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPromptModal(log);
                                  }}
                                  className='text-xs text-primary hover:text-primary flex items-center gap-1'
                                >
                                  <Eye className='h-3 w-3' />
                                  {t('admin_api_logs.view_all')}
                                </button>
                              </div>
                              <div className='space-y-2 max-h-64 overflow-y-auto'>
                                {(() => {
                                  const isMessagesExpanded =
                                    expandedMessages.has(log._id);
                                  const displayMessages = isMessagesExpanded
                                    ? log.messages
                                    : log.messages.slice(-2); // 최신 2개만

                                  return (
                                    <>
                                      {!isMessagesExpanded &&
                                        log.messages.length > 2 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleMessagesExpansion(log._id);
                                            }}
                                            className='w-full text-xs text-primary hover:text-primary text-center py-2 rounded hover:bg-primary/10 transition-colors'
                                          >
                                            {t('admin_api_logs.show_more_messages', { count: log.messages.length - 2 })}
                                          </button>
                                        )}
                                      {displayMessages.map((msg, idx) => {
                                        const originalIdx = isMessagesExpanded
                                          ? idx
                                          : log.messages.length - 2 + idx;
                                        const messageKey = `${log._id}-${originalIdx}`;
                                        const isContentExpanded =
                                          expandedMessageContents.has(
                                            messageKey
                                          );
                                        // 메시지 내용 추출 (다양한 형식 지원)
                                        let contentStr = '';
                                        if (typeof msg === 'string') {
                                          contentStr = msg;
                                        } else if (msg.content) {
                                          contentStr = typeof msg.content === 'string' 
                                            ? msg.content 
                                            : JSON.stringify(msg.content, null, 2);
                                        } else if (msg.text) {
                                          contentStr = typeof msg.text === 'string' 
                                            ? msg.text 
                                            : JSON.stringify(msg.text, null, 2);
                                        } else if (msg.message) {
                                          contentStr = typeof msg.message === 'string' 
                                            ? msg.message 
                                            : JSON.stringify(msg.message, null, 2);
                                        } else {
                                          // 객체 전체를 표시
                                          contentStr = JSON.stringify(msg, null, 2);
                                        }
                                        const shouldTruncate =
                                          contentStr.length > 100;

                                        return (
                                          <div
                                            key={originalIdx}
                                            className='bg-muted rounded p-3 text-xs'
                                          >
                                            <div className='font-semibold text-foreground mb-1'>
                                              {(() => {
                                                const role = typeof msg === 'object' && msg !== null 
                                                  ? (msg.role || msg.type || 'unknown')
                                                  : 'unknown';
                                                if (role === 'user') return '👤 User';
                                                if (role === 'assistant') return '🤖 Assistant';
                                                if (role === 'system') return '⚙️ System';
                                                return `📝 ${role}`;
                                              })()}
                                            </div>
                                            <div className='text-muted-foreground whitespace-pre-wrap break-words'>
                                              {shouldTruncate &&
                                              !isContentExpanded
                                                ? contentStr.substring(0, 100) +
                                                  '...'
                                                : contentStr}
                                            </div>
                                            {shouldTruncate && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleMessageContentExpansion(
                                                    log._id,
                                                    originalIdx
                                                  );
                                                }}
                                                className='mt-1 text-primary hover:text-primary text-xs'
                                              >
                                                {isContentExpanded
                                                  ? t('admin_api_logs.fold')
                                                  : t('admin_api_logs.view_more')}
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                      {isMessagesExpanded &&
                                        log.messages.length > 2 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleMessagesExpansion(log._id);
                                            }}
                                            className='w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 rounded hover:bg-accent transition-colors'
                                          >
                                            {t('admin_api_logs.show_latest_2')}
                                          </button>
                                        )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          )}

                        {/* 오류 메시지 */}
                        {log.error && (
                          <div className='bg-destructive/10 border border-destructive/30 rounded-lg p-4'>
                            <p className='text-sm text-destructive'>
                              <strong>{t('admin_api_logs.error_label')}</strong> {log.error}
                            </p>
                          </div>
                        )}

                        {/* HTTP Request 정보 */}
                        <details className='bg-card rounded-lg shadow-sm'>
                          <summary className='cursor-pointer p-4 hover:bg-accent rounded-lg transition-colors'>
                            <div className='flex items-center justify-between'>
                              <h4 className='text-sm font-semibold text-foreground inline-flex items-center gap-2'>
                                <span className='px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono'>
                                  POST
                                </span>
                                HTTP Request
                              </h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const requestData = {
                                    method: 'POST',
                                    url:
                                      log.endpoint ||
                                      '/api/v1/chat/completions',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization:
                                        log.authorization === 'present'
                                          ? 'Bearer ***'
                                          : undefined,
                                      'User-Agent': log.userAgent,
                                    },
                                    body: {
                                      model: log.model,
                                      messages:
                                        log.messages ||
                                        (log.prompt
                                          ? [
                                              {
                                                role: 'user',
                                                content: log.prompt,
                                              },
                                            ]
                                          : []),
                                      stream: log.isStream,
                                    },
                                  };
                                  copyJson(requestData);
                                }}
                                className='flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded transition-colors'
                                title={t('admin_api_logs.copy_request')}
                              >
                                <Copy className='h-3 w-3' />
                                {t('admin_api_logs.copy')}
                              </button>
                            </div>
                          </summary>

                          <div className='p-4 pt-0 space-y-2'>
                            {/* URL */}
                            <div className='text-xs'>
                              <span className='text-muted-foreground'>
                                URL:
                              </span>
                              <code className='ml-2 font-mono text-foreground'>
                                {log.endpoint || '/api/v1/chat/completions'}
                              </code>
                            </div>

                            {/* Request Body 요약 */}
                            <div className='text-xs'>
                              <span className='text-muted-foreground'>
                                Body:
                              </span>
                              <span className='ml-2 text-foreground'>
                                model:{' '}
                                <code className='font-mono'>
                                  {log.modelLabel || log.model}
                                </code>,
                                stream:{' '}
                                <code className='font-mono'>
                                  {log.isStream ? 'true' : 'false'}
                                </code>
                                {log.messages &&
                                  `, messages: ${log.messages.length}${t('admin_api_logs.unit_count')}`}
                              </span>
                            </div>
                          </div>
                        </details>

                        {/* HTTP Response 정보 */}
                        <details className='bg-card rounded-lg shadow-sm'>
                          <summary className='cursor-pointer p-4 hover:bg-accent rounded-lg transition-colors'>
                            <div className='flex items-center justify-between'>
                              <h4 className='text-sm font-semibold text-foreground inline-flex items-center gap-2'>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-mono ${
                                    log.statusCode >= 200 &&
                                    log.statusCode < 300
                                      ? 'bg-primary/10 text-primary'
                                      : log.statusCode >= 400 &&
                                        log.statusCode < 500
                                      ? 'bg-muted text-muted-foreground'
                                      : 'bg-destructive/10 text-destructive'
                                  }`}
                                >
                                  {log.statusCode}
                                </span>
                                HTTP Response
                              </h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const responseData = {
                                    status: log.statusCode,
                                    headers: log.responseHeaders || {
                                      'Content-Type': log.isStream
                                        ? 'text/event-stream'
                                        : 'application/json',
                                    },
                                    body: log.responseBody || log.error,
                                    usage: {
                                      prompt_tokens: log.promptTokenCount,
                                      completion_tokens: log.responseTokenCount,
                                      total_tokens: log.totalTokenCount,
                                    },
                                  };
                                  copyJson(responseData);
                                }}
                                className='flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded transition-colors'
                                title={t('admin_api_logs.copy_response')}
                              >
                                <Copy className='h-3 w-3' />
                                {t('admin_api_logs.copy')}
                              </button>
                            </div>
                          </summary>

                          <div className='p-4 pt-0 space-y-2'>
                            {/* Response Body 요약 */}
                            {log.error ? (
                              <div className='text-xs bg-destructive/10 border border-destructive/30 rounded p-2'>
                                <span className='text-destructive'>
                                  {log.error}
                                </span>
                              </div>
                            ) : log.responseBody ? (
                              <div className='text-xs'>
                                <pre className='font-mono text-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto bg-muted p-2 rounded'>
                                  {typeof log.responseBody === 'string'
                                    ? log.responseBody
                                    : JSON.stringify(log.responseBody, null, 2)}
                                </pre>
                              </div>
                            ) : (
                              <div className='text-xs text-muted-foreground'>
                                {log.isStream
                                  ? t('admin_api_logs.streaming_no_content')
                                  : t('admin_api_logs.no_response_body')}
                              </div>
                            )}
                          </div>
                        </details>

                        {/* 전체 Raw JSON (접을 수 있게) */}
                        <details className='bg-card rounded-lg shadow-sm'>
                          <summary className='cursor-pointer p-4 hover:bg-accent rounded-lg transition-colors'>
                            <div className='flex items-center justify-between'>
                              <h4 className='text-sm font-semibold text-foreground'>
                                {t('admin_api_logs.full_raw_json')}
                              </h4>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyJson(log);
                                }}
                                className='flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded transition-colors'
                                title={t('admin_api_logs.copy_full_json')}
                              >
                                <Copy className='h-3 w-3' />
                                {t('admin_api_logs.copy')}
                              </button>
                            </div>
                          </summary>
                          <div className='p-4 pt-0'>
                            <pre className='text-xs font-mono text-foreground whitespace-pre-wrap break-words max-h-96 overflow-y-auto bg-muted p-3 rounded'>
                              {JSON.stringify(log, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className='flex items-center justify-between mt-6'>
            <button
              onClick={() => handlePageChange(filters.page - 1)}
              disabled={!pagination.hasPrev || loading}
              className='flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md bg-card text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent'
            >
              <ChevronLeft className='h-4 w-4' />
              {t('admin_api_logs.prev')}
            </button>

            <div className='flex items-center gap-2'>
              {Array.from(
                { length: Math.min(pagination.totalPages, 5) },
                (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-3 py-2 text-sm rounded-md ${
                        page === filters.page
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border bg-card text-foreground hover:bg-accent'
                      }`}
                    >
                      {page}
                    </button>
                  );
                }
              )}
            </div>

            <button
              onClick={() => handlePageChange(filters.page + 1)}
              disabled={!pagination.hasNext || loading}
              className='flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md bg-card text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent'
            >
              {t('admin_api_logs.next')}
              <ChevronRight className='h-4 w-4' />
            </button>
          </div>
        )}
      </div>

      {/* 프롬프트 전체 보기 모달 */}
      {promptModal.isOpen && promptModal.log && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          {/* 배경 오버레이 */}
          <div
            className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
            onClick={closePromptModal}
          />
          {/* 모달 내용 */}
          <div className='relative bg-card rounded-lg w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl max-h-[80vh] overflow-hidden'>
            <div className='flex items-center justify-between p-4 border-b border-border'>
              <h3 className='text-lg font-medium text-foreground'>
                {t('admin_api_logs.prompt_full_view')}
              </h3>
              <div className='flex items-center gap-2'>
                <button
                  onClick={() => copyPrompt(promptModal.log.prompt)}
                  className='p-2 text-muted-foreground hover:text-foreground'
                  title={t('admin_api_logs.copy')}
                >
                  <Copy className='h-4 w-4' />
                </button>
                <button
                  onClick={closePromptModal}
                  className='p-2 text-muted-foreground hover:text-foreground'
                >
                  <X className='h-4 w-4' />
                </button>
              </div>
            </div>
            <div className='p-4 overflow-y-auto max-h-[calc(80vh-120px)]'>
              <div className='mb-4'>
                <div className='text-sm text-muted-foreground mb-2'>
                  <strong>{t('admin_api_logs.api_label')}</strong> {promptModal.log.apiType} |
                  <strong> {t('admin_api_logs.model_colon')}</strong>{' '}
                  {promptModal.log.modelLabel || promptModal.log.model} |
                  <strong> {t('admin_api_logs.ip_colon')}</strong> {promptModal.log.clientIP} |
                  <strong> {t('admin_api_logs.time_label')}</strong>{' '}
                  {formatTime(promptModal.log.timestamp)}
                </div>
              </div>
              <div className='bg-muted rounded-lg p-4'>
                <pre className='whitespace-pre-wrap text-sm text-foreground font-mono overflow-x-auto'>
                  {typeof promptModal.log.prompt === 'string'
                    ? promptModal.log.prompt
                    : JSON.stringify(promptModal.log.prompt, null, 2)}
                </pre>
              </div>
              {promptModal.log.messages &&
                Array.isArray(promptModal.log.messages) && (
                  <div className='mt-4'>
                    <h4 className='font-medium text-foreground mb-2'>
                      {t('admin_api_logs.message_array_count', { count: promptModal.log.messages.length })}
                    </h4>
                    <div className='bg-muted rounded-lg p-4 space-y-3'>
                      {promptModal.log.messages.map((msg, index) => {
                        // 메시지 내용 추출 (다양한 형식 지원)
                        let messageContent = null;
                        if (typeof msg === 'string') {
                          messageContent = msg;
                        } else if (msg.content) {
                          messageContent = msg.content;
                        } else if (msg.text) {
                          messageContent = msg.text;
                        } else if (msg.message) {
                          messageContent = msg.message;
                        } else {
                          messageContent = msg;
                        }
                        
                        // role 추출
                        const role = typeof msg === 'object' && msg !== null 
                          ? (msg.role || msg.type || 'unknown')
                          : 'unknown';
                        
                        return (
                          <div
                            key={index}
                            className='bg-card p-3 rounded border border-border'
                          >
                            <div className='text-xs font-semibold text-foreground mb-1'>
                              [{index + 1}] {role === 'user' ? '👤 User' : role === 'assistant' ? '🤖 Assistant' : role === 'system' ? '⚙️ System' : `📝 ${role}`}
                            </div>
                            <pre className='whitespace-pre-wrap text-sm text-foreground font-mono overflow-x-auto'>
                              {renderContent(messageContent)}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                    <div className='mt-2'>
                      <button
                        onClick={() => copyPrompt(promptModal.log.messages)}
                        className='flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded transition-colors'
                        title={t('admin_api_logs.copy_message_array')}
                      >
                        <Copy className='h-3 w-3' />
                        {t('admin_api_logs.copy_message_array')}
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
