'use client';


import logger from '@/lib/logger';
import { useEffect, useMemo, useState } from 'react';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';

export default function DbSchemaPage() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [expandedTables, setExpandedTables] = useState(new Set());
  const [selectedTarget, setSelectedTarget] = useState('main');
  const [availableTargets, setAvailableTargets] = useState([
    {
      value: 'main',
      label: t('admin_db_schema.default_db'),
    },
  ]);

  const filteredTables = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return tables;
    return tables
      .map((table) => {
        const matchesTable = table.name.toLowerCase().includes(query);
        const filteredColumns = table.columns.filter((column) => {
          return (
            column.name.toLowerCase().includes(query) ||
            column.type.toLowerCase().includes(query)
          );
        });
        if (matchesTable || filteredColumns.length > 0) {
          return {
            ...table,
            columns: matchesTable ? table.columns : filteredColumns,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [tables, filterText]);

  const handleExpandAll = () => {
    setExpandedTables(new Set(filteredTables.map((table) => table.name)));
  };

  const handleCollapseAll = () => {
    setExpandedTables(new Set());
  };

  const toggleTable = (tableName) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  const handleTargetChange = (event) => {
    setSelectedTarget(event.target.value);
    setExpandedTables(new Set());
    setFilterText('');
  };

  useEffect(() => {
    const loadSchema = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `/api/admin/db-schema?target=${encodeURIComponent(selectedTarget)}`,
          {
          headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!response.ok) {
          let errorMessage = t('admin_db_schema.fetch_failed');
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorData = JSON.parse(errorText);
              if (errorData?.error) {
                errorMessage = errorData.error;
              } else {
                errorMessage = errorText;
              }
            } catch {
              errorMessage = errorText;
            }
          }
          throw new Error(errorMessage);
        }
        const data = await response.json();
        setTables(data.tables || []);
        if (Array.isArray(data.availableTargets) && data.availableTargets.length) {
          setAvailableTargets(data.availableTargets);
        }
        if (data.selectedTarget && data.selectedTarget !== selectedTarget) {
          setSelectedTarget(data.selectedTarget);
        }
      } catch (error) {
        logger.error(t('admin_db_schema.fetch_failed'), error);
        alert(
          error.message || t('admin_db_schema.fetch_failed_message'),
          'error',
          t('admin_db_schema.fetch_failed_title')
        );
      } finally {
        setLoading(false);
      }
    };

    loadSchema();
  }, [alert, selectedTarget, t]);

  return (
    <div className='space-y-6'>
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-xl font-semibold text-foreground'>
              {t('admin_db_schema.title')}
            </h1>
            <p className='text-sm text-muted-foreground mt-2'>
              {t('admin_db_schema.subtitle')}
            </p>
          </div>
          <div className='flex items-end gap-2'>
            <label className='text-xs text-muted-foreground'>
              {t('admin_db_schema.db_target')}
            </label>
            <select
              value={selectedTarget}
              onChange={handleTargetChange}
              className='px-3 py-1.5 text-sm border border-border rounded-md bg-card text-foreground'
            >
              {availableTargets.map((target) => (
                <option key={target.value} value={target.value}>
                  {target.label}
                </option>
              ))}
            </select>
            <a
              href='/admin/settings'
              className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none text-sm px-3 py-1.5'
            >
              {t('admin_db_schema.back_to_settings')}
            </a>
          </div>
        </div>
      </div>

      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_db_schema.folder_summary')}
            </h2>
            <p className='text-sm text-muted-foreground mt-2'>
              {t('admin_db_schema.folder_summary_desc')}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={handleExpandAll}
              className='px-3 py-1.5 text-xs rounded bg-muted text-foreground'
            >
              {t('admin_db_schema.expand_all')}
            </button>
            <button
              type='button'
              onClick={handleCollapseAll}
              className='px-3 py-1.5 text-xs rounded bg-muted text-foreground'
            >
              {t('admin_db_schema.collapse_all')}
            </button>
          </div>
        </div>
        <div className='mt-4'>
          <input
            type='text'
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={t('admin_db_schema.search_placeholder')}
            className='w-full px-3 py-2 text-sm border border-border rounded-md bg-card text-foreground'
          />
        </div>
        <div className='mt-4 space-y-2'>
          {loading && (
            <div className='text-sm text-muted-foreground'>
              {t('admin_db_schema.loading')}
            </div>
          )}
          {!loading && filteredTables.length === 0 && (
            <div className='text-sm text-muted-foreground'>
              {t('admin_db_schema.no_tables')}
            </div>
          )}
          {!loading &&
            filteredTables.map((table) => (
              <div
                key={`${table.name}-tree`}
                className='rounded-md border border-border bg-muted px-3 py-2'
              >
                <button
                  type='button'
                  onClick={() => toggleTable(table.name)}
                  className='w-full text-left text-sm font-medium text-foreground'
                >
                  {expandedTables.has(table.name) ? '📂' : '📁'} {table.name} (
                  {table.columns.length})
                </button>
                {expandedTables.has(table.name) && (
                  <div className='mt-2 space-y-1'>
                    {table.columns.map((column) => (
                      <div
                        key={`${table.name}-${column.name}-tree`}
                        className='text-xs text-muted-foreground pl-4'
                      >
                        📄 {column.name}{' '}
                        <span className='text-muted-foreground'>({column.type})</span>
                        <span className='ml-2 text-muted-foreground'>
                          NULL {column.nullable ? 'YES' : 'NO'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
