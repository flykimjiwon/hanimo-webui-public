'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Monitor,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Filter,
} from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

export default function SSOLogsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalCount: 0,
    totalPages: 0,
  });

  // 필터
  const [filters, setFilters] = useState({
    employeeNo: '',
    loginSuccess: '',
    startDate: '',
    endDate: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // 상세 보기
  const [expandedLog, setExpandedLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.employeeNo) params.append('employeeNo', filters.employeeNo);
      if (filters.loginSuccess) params.append('loginSuccess', filters.loginSuccess);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const res = await fetch(`/api/admin/sso-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(t('admin_sso_logs.fetch_failed'));

      const data = await res.json();
      setLogs(data.data.logs);
      setPagination((prev) => ({ ...prev, ...data.data.pagination }));
      setStats(data.data.stats);
    } catch (error) {
      logger.error(t('admin_sso_logs.fetch_error'), error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, t]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchLogs();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusBadge = (log) => {
    if (log.login_success) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
          <CheckCircle className="h-3 w-3" />
          {t('admin_sso_logs.status_success')}
        </span>
      );
    }
    if (log.sso_login_deny_yn === 'Y') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          {t('admin_sso_logs.status_denied')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
        <XCircle className="h-3 w-3" />
        {t('admin_sso_logs.status_failed')}
      </span>
    );
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile' || deviceType === 'Tablet') {
      return <Smartphone className="h-4 w-4 text-muted-foreground" />;
    }
    return <Monitor className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow='보안 로그'
        title={t('admin_sso_logs.title')}
        sub={t('admin_sso_logs.subtitle')}
        actions={
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin_sso_logs.refresh')}
          </button>
        }
      />

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="text-2xl font-bold text-foreground">
              {stats.total}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('admin_sso_logs.total_7days')}
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="text-2xl font-bold text-primary">
              {stats.success_count}
            </div>
            <div className="text-sm text-muted-foreground">{t('admin_sso_logs.success')}</div>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="text-2xl font-bold text-destructive">
              {stats.fail_count}
            </div>
            <div className="text-sm text-muted-foreground">{t('admin_sso_logs.failure')}</div>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="text-2xl font-bold text-muted-foreground">
              {stats.deny_count}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('admin_sso_logs.login_denied')}
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="text-2xl font-bold text-muted-foreground">
              {stats.client_error_count}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('admin_sso_logs.client_error')}
            </div>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="bg-card rounded-lg border border-border p-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Filter className="h-4 w-4" />
          {t('admin_sso_logs.filter')}
          {showFilters ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showFilters && (
          <form onSubmit={handleSearch} className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('admin_sso_logs.employee_no')}
              </label>
              <input
                type="text"
                value={filters.employeeNo}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, employeeNo: e.target.value }))
                }
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm"
                placeholder={t('admin_sso_logs.employee_no_search')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('admin_sso_logs.result')}
              </label>
              <select
                value={filters.loginSuccess}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, loginSuccess: e.target.value }))
                }
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm"
              >
                <option value="">{t('admin_sso_logs.all')}</option>
                <option value="true">{t('admin_sso_logs.success')}</option>
                <option value="false">{t('admin_sso_logs.failure')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('admin_sso_logs.start_date')}
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('admin_sso_logs.end_date')}
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2">
                <Search className="h-4 w-4" />
                {t('admin_sso_logs.search')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 로그 테이블 */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {t('admin_sso_logs.col_time')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {t('admin_sso_logs.col_employee_no')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {t('admin_sso_logs.col_name')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('admin_sso_logs.col_group')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {t('admin_sso_logs.col_result')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {t('admin_sso_logs.col_browser')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {t('admin_sso_logs.col_error')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {t('admin_sso_logs.col_detail')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    {t('admin_sso_logs.no_logs')}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr
                      className="hover:bg-accent"
                    >
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-foreground">
                        {log.employee_no || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {log.sso_employee_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {log.sso_department_name || '-'}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(log)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getDeviceIcon(log.device_type)}
                          <span className="text-sm text-muted-foreground">
                            {log.browser_name} {log.browser_version}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {log.error_type ? (
                          <span className="text-destructive">
                            {log.error_type}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            setExpandedLog(expandedLog === log.id ? null : log.id)
                          }
                          className="text-primary hover:text-primary/80 text-sm"
                        >
                          {expandedLog === log.id ? t('admin_sso_logs.close') : t('admin_sso_logs.view')}
                        </button>
                      </td>
                    </tr>
                    {expandedLog === log.id && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 bg-muted">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                SSO Result Code
                              </div>
                              <div className="text-foreground">
                                {log.sso_result_code || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                Auth Result
                              </div>
                              <div className="text-foreground">
                                {log.sso_auth_result || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                Login Deny
                              </div>
                              <div className={log.sso_login_deny_yn === 'Y' ? 'text-destructive' : 'text-foreground'}>
                                {log.sso_login_deny_yn || 'N'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                {t('admin_sso_logs.jwt_issued')}
                              </div>
                              <div className="text-foreground">
                                {log.jwt_issued ? t('common.yes') : t('common.no')}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                Client IP
                              </div>
                              <div className="text-foreground font-mono">
                                {log.client_ip || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                OS
                              </div>
                              <div className="text-foreground">
                                {log.os_name} {log.os_version}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                Transaction ID
                              </div>
                              <div className="text-foreground font-mono text-xs">
                                {log.sso_transaction_id || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                {t('admin_sso_logs.company')}
                              </div>
                              <div className="text-foreground">
                                {log.sso_company_name || '-'} ({log.sso_company_code || '-'})
                              </div>
                            </div>
                            {log.error_message && (
                              <div className="col-span-2 md:col-span-4">
                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                  {t('admin_sso_logs.error_message')}
                                </div>
                                <div className="text-destructive bg-destructive/10 p-2 rounded">
                                  {log.error_message}
                                  {log.error_detail && (
                                    <div className="text-xs mt-1 text-destructive/80">
                                      {t('admin_sso_logs.detail')}: {log.error_detail}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {log.sso_auth_result_message && (
                              <div className="col-span-2 md:col-span-4">
                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                  SSO Auth Result Message
                                </div>
                                <div className="text-foreground bg-muted p-2 rounded">
                                  {log.sso_auth_result_message}
                                </div>
                              </div>
                            )}
                            {log.client_error_type && (
                              <div className="col-span-2 md:col-span-4">
                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                  {t('admin_sso_logs.client_error')}
                                </div>
                                <div className="text-muted-foreground bg-muted p-2 rounded">
                                  [{log.client_error_type}] {log.client_error_message}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {t('admin_sso_logs.showing_range', { total: pagination.totalCount, start: (pagination.page - 1) * pagination.limit + 1, end: Math.min(pagination.page * pagination.limit, pagination.totalCount) })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page <= 1}
                className="inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none text-sm disabled:opacity-50"
              >
                {t('common.previous')}
              </button>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none text-sm disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
