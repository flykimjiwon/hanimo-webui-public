'use client';


import logger from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export function useErrorLogs() {
  const { t } = useTranslation();
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorLogsTotal, setErrorLogsTotal] = useState(0);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogsSource, setErrorLogsSource] = useState('all');
  const [errorLogsLevel, setErrorLogsLevel] = useState('all');

  const fetchErrorLogs = async (override = {}) => {
    try {
      setErrorLogsLoading(true);
      const token = localStorage.getItem('token');
      const source = override.source ?? errorLogsSource;
      const level = override.level ?? errorLogsLevel;
      const params = new URLSearchParams();
      if (source && source !== 'all') params.set('source', source);
      if (level && level !== 'all') params.set('level', level);
      params.set('limit', '50');
      const response = await fetch(
        `/api/admin/error-logs?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) return;
      const data = await response.json();
      setErrorLogs(data.logs || []);
      setErrorLogsTotal(data.total || 0);
    } catch (error) {
      logger.warn(t('admin_models.console_error_log_failed'), error);
    } finally {
      setErrorLogsLoading(false);
    }
  };

  const formatLogTime = (value) => {
    try {
      return new Date(value).toLocaleString('ko-KR');
    } catch (error) {
      return value || '-';
    }
  };

  useEffect(() => {
    fetchErrorLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorLogsSource, errorLogsLevel]);

  return {
    errorLogs,
    errorLogsTotal,
    errorLogsLoading,
    errorLogsSource,
    errorLogsLevel,
    setErrorLogsSource,
    setErrorLogsLevel,
    fetchErrorLogs,
    formatLogTime,
  };
}
