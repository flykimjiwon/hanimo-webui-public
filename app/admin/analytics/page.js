'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Download, Filter } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_DEPARTMENTS } from '@/lib/departments.mjs';

const UserStatsChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.UserStatsChart), { ssr: false });
const ModelStatsChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.ModelStatsChart), { ssr: false });
const DepartmentStatsChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.DepartmentStatsChart), { ssr: false });
const DailyActivityChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.DailyActivityChart), { ssr: false });
const TokenUsageChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.TokenUsageChart), { ssr: false });
const DepartmentTokenUsageChart = dynamic(() => import('@/components/admin/AnalyticsCharts').then(m => m.DepartmentTokenUsageChart), { ssr: false });

const PERIOD_OPTIONS = [
  { value: '7days', labelKey: 'admin_analytics.period_7days' },
  { value: '30days', labelKey: 'admin_analytics.period_30days' },
  { value: '3months', labelKey: 'admin_analytics.period_3months' },
  { value: '1year', labelKey: 'admin_analytics.period_1year' },
  { value: 'custom', labelKey: 'admin_analytics.period_custom' },
];

const DEFAULT_DEPTS = DEFAULT_DEPARTMENTS;

const INITIAL_DATA = {
  userStats: [],
  modelStats: [],
  departmentStats: [],
  dailyActivity: [],
  monthlyTrends: [],
  tokenUsage: [],
  departmentTokenUsage: [],
};

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const LoadingSkeleton = () => (
  <div className='space-y-6'>
    <div className='animate-pulse'>
      <div className='h-8 bg-muted rounded w-1/4 mb-4'></div>
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='h-64 bg-muted rounded' />
        ))}
      </div>
    </div>
  </div>
);

export default function Analytics() {
  const { t } = useTranslation();
  const [data, setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('7days');
  const [deptFilter, setDeptFilter] = useState('all');
  const [departments, setDepartments] = useState([]);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    fetch('/api/admin/departments', { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { departments: [] }))
      .then(({ departments: rows = [] }) => {
        const seen = new Map();
        rows.forEach(({ department, auth_type }) => {
          seen.set(
          `${department}|${auth_type}`,
          auth_type === 'sso'
            ? `${department.replaceAll('부서', '그룹')}(SSO)`
            : `${department.replaceAll('부서', '그룹')}(${t('admin_analytics.auth_local')})`
        );
        });
        DEFAULT_DEPTS.forEach((dept) => {
          if (!seen.has(`${dept}|local`)) seen.set(`${dept}|local`, `${dept}(${t('admin_analytics.auth_local')})`);
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
          label: `${d.replaceAll('부서', '그룹')}(${t('admin_analytics.auth_local')})`,
        }))
      );
      });
  }, [t]);

  const fetchAnalyticsData = useCallback(async () => {
    setLoading(true);
    try {
      const [deptName, authType] = deptFilter !== 'all' ? deptFilter.split('|') : ['all', ''];
      const queryParams = new URLSearchParams({
        period: selectedPeriod,
        department: deptName,
      });
      if (authType) queryParams.set('authType', authType);
      if (selectedPeriod === 'custom') {
        if (customStartDate) queryParams.append('startDate', customStartDate);
        if (customEndDate) queryParams.append('endDate', customEndDate);
      }
      const response = await fetch(`/api/admin/analytics?${queryParams}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (error) {
      logger.error(t('admin_analytics.data_load_failed'), error);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, deptFilter, customStartDate, customEndDate, t]);

  useEffect(() => {
    if (selectedPeriod !== 'custom') {
      fetchAnalyticsData();
    }
  }, [selectedPeriod, deptFilter, fetchAnalyticsData]);

  const handleExportData = useCallback(async () => {
    try {
      const [deptName, authType] = deptFilter !== 'all' ? deptFilter.split('|') : ['all', ''];
      const queryParams = new URLSearchParams({
        period: selectedPeriod,
        department: deptName,
      });
      if (authType) queryParams.set('authType', authType);
      if (selectedPeriod === 'custom') {
        if (customStartDate) queryParams.append('startDate', customStartDate);
        if (customEndDate) queryParams.append('endDate', customEndDate);
      }
      const response = await fetch(
        `/api/admin/analytics/export?${queryParams}`,
        { headers: getAuthHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const filename = `analytics-${selectedPeriod}-${Date.now()}.csv`;
      downloadFile(blob, filename);
    } catch (error) {
      logger.error(t('admin_analytics.export_failed'), error);
    }
  }, [selectedPeriod, deptFilter, customStartDate, customEndDate, t]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className='space-y-6'>
      <PageHead
        eyebrow='데이터 분석'
        title={t('admin_analytics.title')}
        sub={t('admin_analytics.subtitle')}
        actions={
          <Button variant='outline' onClick={handleExportData}>
            <Download className='h-4 w-4' />
            {t('admin_analytics.export')}
          </Button>
        }
      />

      <div className='bg-card shadow rounded-lg p-6'>
        <div className='space-y-4'>
          <div className='flex items-center gap-4 flex-wrap'>
            <div className='flex items-center gap-2'>
              <Filter className='h-4 w-4 text-muted-foreground' />
              <span className='text-sm font-medium text-foreground'>
                {t('admin_analytics.filter')}
              </span>
            </div>

            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className='min-w-[120px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((period) => (
                  <SelectItem key={period.value} value={period.value}>
                    {t(period.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className='min-w-[160px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('admin_analytics.all_groups')}</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPeriod === 'custom' && (
            <div className='flex items-center gap-3 flex-wrap pl-6'>
              <span className='text-sm text-muted-foreground'>
                {t('admin_analytics.period_label')}
              </span>
              <input
                type='date'
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 w-auto min-w-[140px]'
                placeholder={t('admin_analytics.start_date')}
              />
              <span className='text-sm text-muted-foreground'>~</span>
              <input
                type='date'
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 w-auto min-w-[140px]'
                placeholder={t('admin_analytics.end_date')}
              />
              <button
                onClick={fetchAnalyticsData}
                className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none text-sm px-4 py-2'
              >
                {t('admin_analytics.search')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <UserStatsChart
          data={data.userStats}
          title={t('admin_analytics.user_usage')}
          tooltip={t('admin_analytics.message_count_tooltip')}
        />
        <ModelStatsChart data={data.modelStats} title={t('admin_analytics.model_usage')} />
        <DepartmentStatsChart
          data={data.departmentStats}
                  title={t('admin_analytics.group_usage')}
          tooltip={t('admin_analytics.message_count_tooltip')}
        />
        <DailyActivityChart
          data={data.dailyActivity}
          title={t('admin_analytics.daily_activity')}
          tooltip={t('admin_analytics.message_count_tooltip')}
        />
        <TokenUsageChart data={data.tokenUsage} title={t('admin_analytics.personal_token_usage')} />
        <DepartmentTokenUsageChart
          data={data.departmentTokenUsage}
                  title={t('admin_analytics.group_token_usage')}
        />
      </div>
    </div>
  );
}
