'use client';

import { RefreshCw } from '@/components/icons';

export function ErrorLogsPanel({
  errorLogs,
  errorLogsTotal,
  errorLogsLoading,
  errorLogsSource,
  errorLogsLevel,
  setErrorLogsSource,
  setErrorLogsLevel,
  fetchErrorLogs,
  formatLogTime,
  t,
}) {
  return (
    <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
      <div className='flex items-center justify-between mb-4'>
        <div className='flex items-center gap-3'>
          <RefreshCw className='h-5 w-5 text-muted-foreground' />
          <h2 className='text-lg font-semibold text-foreground'>
            {t('admin_models.error_logs')}
          </h2>
        </div>
        <button
          onClick={() => fetchErrorLogs()}
          disabled={errorLogsLoading}
          className='inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${errorLogsLoading ? 'animate-spin' : ''}`}
          />
          {errorLogsLoading ? t('admin_models.fetching') : t('admin_models.refresh')}
        </button>
      </div>

      <div className='flex flex-wrap items-center gap-2 text-sm mb-3'>
        <span className='text-muted-foreground'>{t('admin_models.source')}</span>
        {['all', 'server', 'api', 'client'].map((source) => (
          <button
            key={source}
            onClick={() => setErrorLogsSource(source)}
            className={`px-3 py-1 rounded-md border text-xs font-medium ${
              errorLogsSource === source
                ? 'bg-primary text-white border-primary'
                : 'bg-card text-foreground border-border'
            }`}
          >
            {source === 'all'
              ? t('admin_models.filter_all')
              : source === 'server'
              ? t('admin_models.filter_server')
              : source === 'api'
              ? 'API'
              : t('admin_models.filter_client')}
          </button>
        ))}
        <span className='ml-2 text-muted-foreground'>{t('admin_models.level')}</span>
        {['all', 'error', 'warn'].map((level) => (
          <button
            key={level}
            onClick={() => setErrorLogsLevel(level)}
            className={`px-3 py-1 rounded-md border text-xs font-medium ${
              errorLogsLevel === level
                ? 'bg-foreground text-white border-foreground dark:bg-muted dark:text-foreground dark:border-border'
                : 'bg-card text-foreground border-border'
            }`}
          >
            {level === 'all' ? t('admin_models.filter_all') : level.toUpperCase()}
          </button>
        ))}
        <span className='ml-auto text-xs text-muted-foreground'>
          {t('admin_models.total_count', { count: errorLogsTotal })}
        </span>
      </div>

      <div className='border border-border rounded-lg overflow-hidden'>
        {errorLogs.length === 0 ? (
          <div className='p-4 text-sm text-muted-foreground'>
            {t('admin_models.no_logs_to_display')}
          </div>
        ) : (
          <div className='divide-y divide-border'>
            {errorLogs.map((log) => (
              <div key={log.id} className='p-4 text-sm'>
                <div className='flex flex-wrap items-center gap-2 mb-1 text-xs text-muted-foreground'>
                  <span>{formatLogTime(log.created_at)}</span>
                  <span>•</span>
                  <span>{log.source}</span>
                  <span>•</span>
                  <span className='uppercase'>{log.level}</span>
                  {log.request_path && (
                    <>
                      <span>•</span>
                      <span>{log.request_path}</span>
                    </>
                  )}
                </div>
                <div className='text-foreground break-words'>{log.message}</div>
                {log.stack && (
                  <pre className='mt-2 text-xs text-muted-foreground whitespace-pre-wrap'>
                    {log.stack}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
