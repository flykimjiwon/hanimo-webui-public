'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useRef } from 'react';
import {
  Users,
  MessageSquare,
  Activity,
  TrendingUp,
  Clock,
  Cpu,
  Database,
  Coins,
} from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PageHead from '@/components/admin/PageHead';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalMessages: 0,
    todayMessages: 0,
    activeUsers: 0,
    tokenUsage: {
      promptTokens: 0,
      responseTokens: 0,
      totalTokens: 0,
    },
    usersChange: 0,
    messagesChange: 0,
    activeUsersChange: 0,
    topModels: [],
    recentActivity: [],
    periodStart: null,
    periodEnd: null,
  });
  const [systemStatus, setSystemStatus] = useState({
    database: {
      status: 'checking',
      message: 'Checking...',
      responseTime: null,
    },
    apiServer: {
      status: 'checking',
      message: 'Checking...',
      responseTime: null,
    },
    modelServers: {
      status: 'checking',
      message: 'Checking...',
      responseTime: null,
    },
    modelServerEndpoints: [],
  });
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateRangeMode, setDateRangeMode] = useState('7days');
  const fetchDashboardDataRef = useRef(null);
  const fetchSystemStatusRef = useRef(null);

  useEffect(() => {
    if (dateRangeMode !== 'custom') {
      fetchDashboardDataRef.current();
    }
    fetchSystemStatusRef.current();
  }, [dateRangeMode]);

  const fetchDashboardData = async () => {
    try {
      const params = new URLSearchParams();

      if (dateRangeMode === 'custom') {
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      } else if (dateRangeMode === '1day') {
        const end = new Date();
        const start = new Date(end.getTime() - 1 * 24 * 60 * 60 * 1000);
        params.append('startDate', start.toISOString().split('T')[0]);
        params.append('endDate', end.toISOString().split('T')[0]);
      } else if (dateRangeMode === '7days') {
        const end = new Date();
        const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append('startDate', start.toISOString().split('T')[0]);
        params.append('endDate', end.toISOString().split('T')[0]);
      }

      const response = await fetch(`/api/admin/dashboard?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      logger.error(t('admin_dashboard.data_load_failed'), error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/admin/system-status', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data.status);
      }
    } catch (error) {
      logger.error(t('admin_dashboard.system_status_failed'), error);
      setSystemStatus({
        database: {
          status: 'error',
          message: 'Check Failed',
          responseTime: null,
        },
        apiServer: {
          status: 'operational',
          message: 'Operational',
          responseTime: 0,
        },
        modelServers: {
          status: 'error',
          message: 'Check Failed',
          responseTime: null,
        },
      });
    }
  };

  fetchDashboardDataRef.current = fetchDashboardData;
  fetchSystemStatusRef.current = fetchSystemStatus;

  if (loading) {
    return (
      <div className='space-y-6'>
        <div className='animate-pulse'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className='pt-5'>
                  <div className='flex items-center'>
                    <div className='flex-shrink-0'>
                      <div className='h-8 w-8 bg-muted rounded'></div>
                    </div>
                    <div className='ml-5 w-0 flex-1'>
                      <div className='h-4 bg-muted rounded w-3/4 mb-2'></div>
                      <div className='h-6 bg-muted rounded w-1/2'></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const formatPeriod = () => {
    if (!stats.periodStart || !stats.periodEnd) return '';
    const start = new Date(stats.periodStart);
    const end = new Date(stats.periodEnd);
    const formatDate = (d) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
    return `${formatDate(start)} ~ ${formatDate(end)}`;
  };

  const formatTokenCount = (count) => {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
  };

  const statCards = [
    {
      name: t('admin_dashboard.new_users'),
      description: formatPeriod(),
      stat: stats.totalUsers,
      delta: stats.usersChange,
      tooltip: t('admin_dashboard.new_users_tooltip'),
      icon: Users,
      color: 'text-primary',
    },
    {
      name: t('admin_dashboard.message_count'),
      description: formatPeriod(),
      stat: stats.totalMessages,
      delta: stats.messagesChange,
      tooltip: t('admin_dashboard.message_count_tooltip'),
      icon: MessageSquare,
      color: 'text-primary',
    },
    {
      name: t('admin_dashboard.today_messages'),
      description: t('admin_dashboard.today_messages_desc'),
      stat: stats.todayMessages,
      tooltip: t('admin_dashboard.today_messages_tooltip'),
      icon: Activity,
      color: 'text-muted-foreground',
    },
    {
      name: t('admin_dashboard.active_users'),
      description: formatPeriod(),
      stat: stats.activeUsers,
      delta: stats.activeUsersChange,
      tooltip: t('admin_dashboard.active_users_tooltip'),
      icon: TrendingUp,
      color: 'text-primary',
    },
    {
      name: t('admin_dashboard.total_token_usage'),
      description: t('admin_dashboard.token_input_output', { input: formatTokenCount(stats.tokenUsage?.promptTokens || 0), output: formatTokenCount(stats.tokenUsage?.responseTokens || 0) }),
      stat: stats.tokenUsage?.totalTokens || 0,
      tooltip: t('admin_dashboard.total_token_tooltip'),
      icon: Coins,
      color: 'text-muted-foreground',
    },
  ];

  // 인기 모델 랭크 도트 색상 캐스케이드 (브랜드 categorical ramp)
  const rankDotColors = [
    'var(--hn-primary)',
    'var(--hn-info)',
    'var(--hn-good)',
    'var(--hn-fg-muted)',
  ];
  const getRankDotColor = (index) =>
    rankDotColors[index] || 'var(--hn-fg-muted)';

  const getStatusColor = (status) => {
    if (status === 'operational') return 'bg-[var(--hn-good)]';
    if (status === 'warning') return 'bg-[var(--hn-warn)]';
    if (status === 'checking') return 'bg-[var(--hn-warn)] animate-pulse';
    return 'bg-[var(--hn-error)]';
  };

  return (
    <div className='space-y-6'>
      <div>
        <PageHead
          eyebrow='워크스페이스 관리'
          title={t('admin_dashboard.title')}
          sub={t('admin_dashboard.subtitle')}
          actions={
            <Button onClick={fetchDashboardData}>
              <Activity className='h-4 w-4' />
              {t('admin_dashboard.refresh')}
            </Button>
          }
        />

        <Card className='mt-4 py-4 bg-card'>
          <CardContent>
            <div className='flex flex-wrap items-center gap-4'>
              <div className='flex items-center gap-2'>
                <Clock className='h-4 w-4 text-muted-foreground' />
                <span className='text-sm font-medium text-foreground'>
                  {t('admin_dashboard.comparison_period')}
                </span>
              </div>

              <Select value={dateRangeMode} onValueChange={setDateRangeMode}>
                <SelectTrigger className='min-w-[140px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='1day'>{t('admin_dashboard.today')}</SelectItem>
                  <SelectItem value='7days'>{t('admin_dashboard.last_7_days')}</SelectItem>
                  <SelectItem value='custom'>{t('admin_dashboard.custom_period')}</SelectItem>
                </SelectContent>
              </Select>

              {dateRangeMode === 'custom' && (
                <>
                  <Input
                    type='date'
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className='min-w-[140px] w-auto'
                    placeholder={t('admin_dashboard.start_date')}
                  />
                  <span className='text-sm text-muted-foreground'>~</span>
                  <Input
                    type='date'
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className='min-w-[140px] w-auto'
                    placeholder={t('admin_dashboard.end_date')}
                  />
                  <Button
                    onClick={fetchDashboardData}
                    size='sm'
                  >
                    {t('admin_dashboard.search')}
                  </Button>
                </>
              )}

              <div className='ml-auto text-xs text-muted-foreground'>
                {t('admin_dashboard.period_stats_note')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'>
        {statCards.map((item) => (
          <Card
            key={item.name}
            className='hover:shadow-lg transition-shadow duration-200'
          >
            <CardContent className='pt-5'>
              <div className='flex items-center'>
                <div className='flex-shrink-0'>
                  <item.icon className={`h-8 w-8 ${item.color}`} />
                </div>
                <div className='ml-5 w-0 flex-1'>
                  <dl>
                    <dt className='text-sm font-medium text-muted-foreground'>
                      <span className='relative inline-flex items-center group'>
                        <span className='cursor-help'>{item.name}</span>
                        <span className='pointer-events-none absolute left-0 bottom-full z-10 mb-2 w-64 rounded-md bg-popover px-3 py-2 text-xs text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100'>
                          {item.tooltip}
                        </span>
                      </span>
                    </dt>
                    <dd className='mt-1'>
                      <div className='flex items-center gap-2'>
                        <div className='text-2xl font-semibold text-foreground'>
                          {item.stat.toLocaleString()}
                        </div>
                        {typeof item.delta === 'number' && item.delta !== 0 && (
                          item.delta > 0 ? (
                            <span className='inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--hn-good-soft)] text-[var(--hn-good)]'>
                              ↑ +{item.delta}%
                            </span>
                          ) : (
                            <span className='inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--hn-error-soft)] text-[var(--hn-error)]'>
                              ↓ {item.delta}%
                            </span>
                          )
                        )}
                      </div>
                      <div className='text-xs text-muted-foreground mt-1'>
                        {item.description}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center mb-4'>
              <Cpu className='h-5 w-5 text-muted-foreground mr-2' />
              <h3 className='text-lg font-medium text-foreground'>
                {t('admin_dashboard.popular_models')}
              </h3>
            </div>
            <div className='space-y-3'>
              {stats.topModels?.slice(0, 5).map((model, index) => (
                <div
                  key={model._id || model.model || `model-${index}`}
                  className='flex items-center justify-between'
                >
                  <div className='flex items-center'>
                    <div className='flex-shrink-0'>
                      <div
                        className='h-2 w-2 rounded-full'
                        style={{ backgroundColor: getRankDotColor(index) }}
                      ></div>
                    </div>
                    <div className='ml-3'>
                      <p className='text-sm font-medium text-foreground'>
                        {model.label || model.model_name || t('admin_dashboard.deleted_model')}
                      </p>
                      {model.server_name && (
                        <p className='text-xs text-muted-foreground'>
                          {model.server_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className='text-sm text-muted-foreground'>
                    {t('admin_dashboard.usage_count', { count: model.count })}
                  </div>
                </div>
              ))}
              {(!stats.topModels || stats.topModels.length === 0) && (
                <p className='text-sm text-muted-foreground text-center py-4'>
                  {t('admin_dashboard.no_data')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center mb-4'>
              <Clock className='h-5 w-5 text-muted-foreground mr-2' />
              <h3 className='text-lg font-medium text-foreground'>
                {t('admin_dashboard.recent_activity')}
              </h3>
            </div>
            <div className='space-y-3'>
              {stats.recentActivity?.slice(0, 5).map((activity, index) => (
                <div key={index} className='flex items-center space-x-3'>
                  <div className='flex-shrink-0'>
                                  <div className='h-2 w-2 bg-primary rounded-full'></div>
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-foreground truncate'>
                      {activity.email}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {t('admin_dashboard.model_used', { model: activity.modelLabel || activity.model })}
                    </p>
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {new Date(activity.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </div>
                </div>
              ))}
              {(!stats.recentActivity || stats.recentActivity.length === 0) && (
                <p className='text-sm text-muted-foreground text-center py-4'>
                  {t('admin_dashboard.no_activity_data')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className='pt-6'>
          <div className='flex items-center mb-4'>
            <Database className='h-5 w-5 text-muted-foreground mr-2' />
            <h3 className='text-lg font-medium text-foreground'>
              {t('admin_dashboard.system_status')}
            </h3>
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
            <div className='text-center'>
              <div className='flex items-center justify-center'>
                <div
                  className={`h-3 w-3 rounded-full mr-2 ${getStatusColor(systemStatus.database.status)}`}
                ></div>
                <span className='text-sm text-foreground'>
                  {t('admin_dashboard.database')}
                </span>
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                {systemStatus.database.message}
                {systemStatus.database.responseTime && (
                  <span className='block'>
                    ({systemStatus.database.responseTime}ms)
                  </span>
                )}
              </p>
            </div>

            <div className='text-center'>
              <div className='flex items-center justify-center'>
                <div
                  className={`h-3 w-3 rounded-full mr-2 ${getStatusColor(systemStatus.apiServer.status)}`}
                ></div>
                <span className='text-sm text-foreground'>
                  {t('admin_dashboard.api_server')}
                </span>
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                {systemStatus.apiServer.message}
              </p>
            </div>

            <div className='text-center'>
              <div className='flex items-center justify-center'>
                <div
                  className={`h-3 w-3 rounded-full mr-2 ${getStatusColor(systemStatus.modelServers.status)}`}
                ></div>
                <span className='text-sm text-foreground'>
                  {t('admin_dashboard.model_server')}
                </span>
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                {systemStatus.modelServers.message}
                {systemStatus.modelServers.responseTime && (
                  <span className='block'>
                    ({systemStatus.modelServers.responseTime}ms)
                  </span>
                )}
              </p>

              {Array.isArray(systemStatus.modelServerEndpoints) &&
                systemStatus.modelServerEndpoints.length > 0 && (
                  <div className='mt-4 space-y-2 text-left'>
                    {systemStatus.modelServerEndpoints.map((ep) => (
                      <div
                        key={ep.endpoint}
                        className='flex items-start gap-2 p-2 rounded-md bg-muted border border-border'
                      >
                        <div
                          className={`mt-1 h-2.5 w-2.5 rounded-full ${getStatusColor(ep.status)}`}
                        ></div>
                        <div className='min-w-0'>
                          <div className='text-xs font-medium text-foreground truncate'>
                            {ep.endpoint}
                          </div>
                          <div className='text-[11px] text-muted-foreground'>
                            {ep.message}
                            {typeof ep.responseTime === 'number' && (
                              <span className='ml-1'>
                                ({ep.responseTime}ms)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
