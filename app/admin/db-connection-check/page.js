'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Database, RefreshCw, TriangleAlert } from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toLocaleString('ko-KR');
}

export default function AdminDbConnectionCheckPage() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const describeRootCause = (code) => {
    switch (code) {
      case 'missing-connection-env':
        return t('admin_db_check.cause_missing_env');
      case 'configured-db-and-active-db-mismatch':
        return t('admin_db_check.cause_db_mismatch');
      case 'connected-to-expected-db-name':
        return t('admin_db_check.cause_expected_db');
      case 'unknown-db-name':
        return t('admin_db_check.cause_unknown_db');
      default:
        return code || '-';
    }
  };

  const statusBadge = useMemo(() => {
    if (!result?.success) {
      return {
        tone: 'text-destructive bg-destructive/10',
        icon: <TriangleAlert className='w-4 h-4' />,
        text: t('admin_db_check.check_failed'),
      };
    }

    if (result.connection?.isModol) {
      return {
        tone: 'text-primary bg-primary/10',
        icon: <CheckCircle2 className='w-4 h-4' />,
        text: t('admin_db_check.modol_connected'),
      };
    }

    if (result.connection?.isModolDev) {
      return {
        tone: 'text-muted-foreground bg-muted',
        icon: <TriangleAlert className='w-4 h-4' />,
        text: t('admin_db_check.modol_dev_connected'),
      };
    }

    return {
      tone: 'text-destructive bg-destructive/10',
      icon: <TriangleAlert className='w-4 h-4' />,
      text: t('admin_db_check.unknown_db_connected'),
    };
  }, [result, t]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/db-connection-check', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(t('admin_db_check.parse_failed', { status: response.status }));
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || t('admin_db_check.connection_check_failed', { status: response.status }));
      }

      setResult(data);
    } catch (fetchError) {
      const message = fetchError.message || t('admin_db_check.connection_check_failed_generic');
      setError(message);
      alert(message, 'error', t('admin_db_check.fetch_failed_title'));
    } finally {
      setLoading(false);
    }
  }, [alert, t]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <div className='space-y-6'>
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h1 className='text-xl font-semibold text-foreground'>
              {t('admin_db_check.title')}
            </h1>
            <p className='text-sm text-muted-foreground mt-2'>
              {t('admin_db_check.subtitle')}
            </p>
          </div>
          <button
            type='button'
            onClick={loadStatus}
            disabled={loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none text-sm px-3 py-1.5 inline-flex items-center gap-2 disabled:opacity-60'
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin_db_check.refresh')}
          </button>
        </div>
      </div>

      <div className='bg-card border border-border rounded-xl shadow-sm p-6 space-y-4'>
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium ${statusBadge.tone}`}
        >
          {statusBadge.icon}
          <span>{statusBadge.text}</span>
        </div>

        {error && (
          <div className='rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
            {error}
          </div>
        )}

        {result?.success && (
          <>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3'>
              <div className='rounded-lg bg-muted border border-border p-3'>
                <div className='text-xs text-muted-foreground'>{t('admin_db_check.active_db')}</div>
                <div className='mt-1 text-sm font-semibold text-foreground break-all'>
                  {result.connection?.activeDatabase || '-'}
                </div>
              </div>
              <div className='rounded-lg bg-muted border border-border p-3'>
                <div className='text-xs text-muted-foreground'>{t('admin_db_check.env_db')}</div>
                <div className='mt-1 text-sm font-semibold text-foreground break-all'>
                  {result.connection?.configuredDatabase || '-'}
                </div>
              </div>
              <div className='rounded-lg bg-muted border border-border p-3'>
                <div className='text-xs text-muted-foreground'>{t('admin_db_check.match_status')}</div>
                <div className='mt-1 text-sm font-semibold text-foreground'>
                  {result.connection?.matchesConfiguredDatabase === true
                    ? t('admin_db_check.match')
                    : result.connection?.matchesConfiguredDatabase === false
                      ? t('admin_db_check.mismatch')
                      : '-'}
                </div>
              </div>
              <div className='rounded-lg bg-muted border border-border p-3'>
                <div className='text-xs text-muted-foreground'>{t('admin_db_check.check_time_kst')}</div>
                <div className='mt-1 text-sm font-semibold text-foreground'>
                  {formatDateTime(result.server?.checkedAtKst)}
                </div>
              </div>
              <div className='rounded-lg bg-muted border border-border p-3'>
                <div className='text-xs text-muted-foreground'>{t('admin_db_check.connection_fingerprint')}</div>
                <div className='mt-1 text-sm font-semibold text-foreground break-all'>
                  {result.diagnostics?.connectionFingerprint || '-'}
                </div>
              </div>
            </div>

            <div className='rounded-lg border border-border overflow-hidden'>
              <div className='px-4 py-2 bg-muted text-sm font-semibold text-foreground flex items-center gap-2'>
                <Database className='w-4 h-4' />
                {t('admin_db_check.connection_detail')}
              </div>
              <div className='p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm'>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.connection_source')}</span>
                  <div className='text-foreground break-all'>
                    {result.connection?.source || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.probable_cause')}</span>
                  <div className='text-foreground break-all'>
                    {describeRootCause(result.diagnostics?.probableRootCause)}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.masked_uri')}</span>
                  <div className='text-foreground break-all'>
                    {result.connection?.configuredUriMasked || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.env_host_port')}</span>
                  <div className='text-foreground break-all'>
                    {result.connection?.configuredHost || '-'}
                    {result.connection?.configuredPort
                      ? `:${result.connection.configuredPort}`
                      : ''}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.env_db_user')}</span>
                  <div className='text-foreground break-all'>
                    {result.connection?.configuredUser || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.db_user')}</span>
                  <div className='text-foreground break-all'>
                    {result.server?.currentUser || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.schema')}</span>
                  <div className='text-foreground break-all'>
                    {result.server?.currentSchema || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.db_server_ip')}</span>
                  <div className='text-foreground break-all'>
                    {result.server?.serverIp || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.db_server_port')}</span>
                  <div className='text-foreground break-all'>
                    {result.server?.serverPort || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.db_oid')}</span>
                  <div className='text-foreground break-all'>
                    {formatNumber(result.server?.databaseOid)}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>{t('admin_db_check.replica_status')}</span>
                  <div className='text-foreground break-all'>
                    {result.server?.isReplica === true
                      ? 'Replica'
                      : result.server?.isReplica === false
                        ? 'Primary'
                        : '-'}
                  </div>
                </div>
                <div className='md:col-span-2'>
                  <span className='text-muted-foreground'>{t('admin_db_check.db_server_version')}</span>
                  <div className='text-foreground break-all'>
                    {result.server?.serverVersion || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>NODE_ENV</span>
                  <div className='text-foreground break-all'>
                    {result.env?.nodeEnv || '-'}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>APP_ENV</span>
                  <div className='text-foreground break-all'>
                    {result.env?.appEnv || '-'}
                  </div>
                </div>
              </div>
            </div>

            <div className='rounded-lg border border-border overflow-hidden'>
              <div className='px-4 py-2 bg-muted text-sm font-semibold text-foreground'>
                {t('admin_db_check.data_metrics')}
              </div>
              <div className='p-4 space-y-3 text-sm'>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                  <div className='rounded-md bg-muted border border-border p-3'>
                    <div className='text-xs text-muted-foreground'>{t('admin_db_check.public_table_count')}</div>
                    <div className='mt-1 font-semibold text-foreground'>
                      {formatNumber(result.server?.publicTableCount)}
                    </div>
                  </div>
                  <div className='rounded-md bg-muted border border-border p-3'>
                    <div className='text-xs text-muted-foreground'>{t('admin_db_check.approx_row_count')}</div>
                    <div className='mt-1 font-semibold text-foreground'>
                      {formatNumber(result.server?.approxLiveRows)}
                    </div>
                  </div>
                  <div className='rounded-md bg-muted border border-border p-3'>
                    <div className='text-xs text-muted-foreground'>{t('admin_db_check.connection_fingerprint')}</div>
                    <div className='mt-1 font-semibold text-foreground break-all'>
                      {result.diagnostics?.connectionFingerprint || '-'}
                    </div>
                  </div>
                </div>

                <div>
                  <div className='text-xs text-muted-foreground mb-2'>
                    {t('admin_db_check.key_table_rows')}
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2'>
                    {Object.entries(result.stats?.keyTableApproxRows || {}).map(
                      ([tableName, approxRows]) => (
                        <div
                          key={tableName}
                          className='rounded-md border border-border px-3 py-2 bg-background'
                        >
                          <div className='text-xs text-muted-foreground'>
                            {tableName}
                          </div>
                          <div className='text-sm font-semibold text-foreground'>
                            {formatNumber(approxRows)}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className='rounded-lg border border-border overflow-hidden'>
              <div className='px-4 py-2 bg-muted text-sm font-semibold text-foreground'>
                {t('admin_db_check.env_usage')}
              </div>
              <div className='p-4 space-y-3 text-sm'>
                <div className='rounded-md border border-border px-3 py-2 bg-background'>
                  <div className='text-xs text-muted-foreground'>
                    {t('admin_db_check.db_connection_decision')}
                  </div>
                  <div className='mt-1 font-semibold text-foreground'>
                    {result.envUsage?.dbConnectionVariable || '-'}
                  </div>
                  <div className='mt-1 text-xs text-muted-foreground'>
                    {result.envUsage?.dbConnectionSummary || '-'}
                  </div>
                </div>

                <div className='overflow-x-auto border border-border rounded-md'>
                  <table className='min-w-full text-xs'>
                    <thead className='bg-muted text-muted-foreground'>
                      <tr>
                        <th className='px-3 py-2 text-left'>{t('admin_db_check.col_variable')}</th>
                        <th className='px-3 py-2 text-left'>{t('admin_db_check.col_is_set')}</th>
                        <th className='px-3 py-2 text-left'>{t('admin_db_check.col_preview')}</th>
                        <th className='px-3 py-2 text-left'>{t('admin_db_check.col_usage')}</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-border'>
                      {(result.env?.variables || []).map((item) => (
                        <tr key={item.key}>
                          <td className='px-3 py-2 font-medium text-foreground whitespace-nowrap'>
                            {item.key}
                          </td>
                          <td className='px-3 py-2 text-foreground whitespace-nowrap'>
                            {item.isSet ? 'SET' : 'UNSET'}
                          </td>
                          <td className='px-3 py-2 text-foreground break-all'>
                            {item.valuePreview || '-'}
                          </td>
                          <td className='px-3 py-2 text-muted-foreground break-all'>
                            {item.usedFor || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className='rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-foreground'>
              <div className='font-semibold'>{t('admin_db_check.guide_title')}</div>
              <ul className='mt-2 list-disc ml-5 space-y-1'>
                <li>
                  {t('admin_db_check.guide_fingerprint')}
                </li>
                <li>
                  {t('admin_db_check.guide_mismatch')}
                </li>
                <li>
                  {t('admin_db_check.guide_identical_rows')}
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
