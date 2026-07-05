'use client';

import PageHead from '@/components/admin/PageHead';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, TriangleAlert } from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslation } from '@/hooks/useTranslation';

function formatMatchedFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return '-';
  }
  return files.join(', ');
}

function EnvValueCard({ label, value }) {
  return (
    <Card className='py-4'>
      <CardContent>
        <div className='text-xs text-muted-foreground'>{label}</div>
        <div className='mt-2 text-sm font-semibold text-foreground break-all'>
          {value || '-'}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminEnvPage() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const badge = useMemo(() => {
    if (!result?.success) {
      return {
        variant: 'destructive',
        icon: <TriangleAlert className='w-4 h-4' />,
        text: t('admin_env.check_failed'),
      };
    }

    return {
      variant: 'default',
      icon: <ShieldCheck className='w-4 h-4' />,
      text: t('admin_env.check_success'),
    };
  }, [result, t]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/env', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const raw = await response.text();
      let data = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(t('admin_env.parse_failed', { status: response.status }));
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || t('admin_env.env_check_failed', { status: response.status }));
      }

      setResult(data);
    } catch (fetchError) {
      const message = fetchError.message || t('admin_env.env_check_failed_generic');
      setError(message);
      alert(message, 'error', t('admin_env.fetch_failed_title'));
    } finally {
      setLoading(false);
    }
  }, [alert, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className='space-y-6'>
      <PageHead
        eyebrow='시스템'
        title={t('admin_env.title')}
        sub={t('admin_env.subtitle')}
        actions={
          <Button onClick={loadData} disabled={loading} size='sm'>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin_env.refresh')}
          </Button>
        }
      />

      <Card>
        <CardContent className='pt-6 space-y-4'>
          <Badge variant={badge.variant} className='gap-2 px-3 py-1.5'>
            {badge.icon}
            <span>{badge.text}</span>
          </Badge>

          {error && (
            <div className='rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
              {error}
            </div>
          )}

          {result?.success && (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <EnvValueCard
                  label='NODE_ENV (runtime)'
                  value={result.runtime?.nodeEnv}
                />
                <EnvValueCard
                  label='POSTGRES_URI (runtime)'
                  value={result.runtime?.postgresUri}
                />
              </div>

              <div className='rounded-lg border border-border overflow-hidden'>
                <div className='px-4 py-2 bg-muted text-sm font-semibold text-foreground'>
                  {t('admin_env.matched_files')}
                </div>
                <div className='p-4 space-y-2 text-sm'>
                  <div>
                    <span className='text-muted-foreground'>{t('admin_env.node_env_candidates')}</span>
                    <div className='text-foreground break-all'>
                      {formatMatchedFiles(result.envFiles?.nodeEnvMatchedFiles)}
                    </div>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>{t('admin_env.postgres_uri_candidates')}</span>
                    <div className='text-foreground break-all'>
                      {formatMatchedFiles(result.envFiles?.postgresUriMatchedFiles)}
                    </div>
                  </div>
                  <div className='text-xs text-muted-foreground pt-1'>
                    {result.envFiles?.caveat}
                  </div>
                </div>
              </div>

              <div className='rounded-lg border border-border overflow-hidden'>
                <div className='px-4 py-2 bg-muted text-sm font-semibold text-foreground'>
                  {t('admin_env.checked_env_files')}
                </div>

                <div className='p-4 space-y-3 text-sm'>
                  <div className='rounded-md border border-border px-3 py-2 bg-background'>
                    <div className='text-xs text-muted-foreground'>{t('admin_env.project_root')}</div>
                    <div className='mt-1 font-medium text-foreground break-all'>
                      {result.envFiles?.projectRoot || '-'}
                    </div>
                  </div>

                  <div className='border border-border rounded-md overflow-hidden'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='px-3 py-2'>{t('admin_env.col_filename')}</TableHead>
                          <TableHead className='px-3 py-2'>{t('admin_env.col_exists')}</TableHead>
                          <TableHead className='px-3 py-2'>NODE_ENV</TableHead>
                          <TableHead className='px-3 py-2'>POSTGRES_URI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(result.envFiles?.snapshots || []).map((item) => (
                          <TableRow key={item.fileName}>
                            <TableCell className='px-3 py-2 font-medium text-foreground whitespace-nowrap'>
                              {item.fileName}
                            </TableCell>
                            <TableCell className='px-3 py-2 text-foreground whitespace-nowrap'>
                              {item.exists ? 'YES' : 'NO'}
                            </TableCell>
                            <TableCell className='px-3 py-2 text-foreground break-all'>
                              {item.hasNodeEnv ? item.nodeEnvValue : '-'}
                            </TableCell>
                            <TableCell className='px-3 py-2 text-foreground break-all'>
                              {item.hasPostgresUri ? item.postgresUriValue : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
