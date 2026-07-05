'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Database,
  Search,
  Plus,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Copy,
  RefreshCw,
  Table,
  Eye,
  EyeOff,
  Hash,
  AlertTriangle,
  Download,
  Upload,
  Globe,
  Server,
  BarChart3,
} from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { getColumnDescription, getTableDescription } from '@/lib/dbColumnDescriptions';

function formatCellValue(value, colType) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  if (
    colType &&
    (colType.includes('timestamp') || colType.includes('date')) &&
    typeof value === 'string'
  ) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul',
      });
    }
  }
  return String(value);
}

function formatSizeBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function truncateText(text, max = 100) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function CellValue({ value, colType, isPrimaryKey }) {
  const [expanded, setExpanded] = useState(false);
  const formatted = formatCellValue(value, colType);

  if (formatted === null) {
    return (
      <span className='inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground select-none'>
        NULL
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
          value
            ? 'bg-[var(--hn-good-soft)] text-[var(--hn-good)]'
            : 'bg-[var(--hn-error-soft)] text-[var(--hn-error)]'
        }`}
      >
        {value ? 'true' : 'false'}
      </span>
    );
  }

  const displayText = String(formatted);
  const isLong = displayText.length > 100;
  const isJson = typeof value === 'object';

  return (
    <div className='group/cell relative'>
      <span
        className={`${isPrimaryKey ? 'font-semibold text-primary' : ''} ${
          isLong || isJson ? 'cursor-pointer' : ''
        }`}
        onClick={() => {
          if (isLong || isJson) setExpanded(!expanded);
        }}
        title={isLong ? displayText : undefined}
      >
        {expanded ? displayText : truncateText(displayText)}
      </span>
      {(isLong || isJson) && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className='ml-1 text-[10px] text-primary hover:text-primary/80'
        >
          More
        </button>
      )}
      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className='ml-1 text-[10px] text-muted-foreground hover:text-foreground'
        >
          Less
        </button>
      )}
    </div>
  );
}

function Tooltip({ children, text, delay = 0, className = '' }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState('bottom');
  const triggerRef = useRef(null);
  const timerRef = useRef(null);

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setPosition(spaceBelow < 120 && spaceAbove > 120 ? 'top' : 'bottom');
      }
      setShow(true);
    }, delay);
  }, [delay]);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!text) return children;

  return (
    <span
      ref={triggerRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {show && (
        <span
          className={`absolute z-50 max-w-[300px] px-2.5 py-1.5 text-xs leading-relaxed rounded-lg border whitespace-normal break-words pointer-events-none transition-opacity duration-150 ${
            position === 'bottom' ? 'top-full mt-1.5 left-1/2 -translate-x-1/2' : 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'
          } bg-popover text-popover-foreground border-border shadow-lg`}
        >
          <span
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border bg-popover ${
              position === 'bottom'
                ? '-top-1 border-l border-t border-border'
                : '-bottom-1 border-r border-b border-border'
            }`}
          />
          {text}
        </span>
      )}
    </span>
  );
}

function RowFormModal({ schema, primaryKeys, row, onSave, onClose, isEdit }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (isEdit && row) {
      setFormData({ ...row });
    } else {
      const initial = {};
      schema.forEach((col) => {
        if (!col.defaultValue && !primaryKeys.includes(col.name)) {
          initial[col.name] = '';
        }
      });
      setFormData(initial);
    }
  }, [schema, primaryKeys, row, isEdit]);

  const editableColumns = useMemo(() => {
    if (isEdit) return schema;
    return schema.filter((col) => {
      const hasSerial =
        col.defaultValue &&
        (col.defaultValue.includes('nextval') || col.defaultValue.includes('gen_random'));
      return !hasSerial;
    });
  }, [schema, isEdit]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {};
    editableColumns.forEach((col) => {
      const val = formData[col.name];
      if (val === '' || val === undefined) {
        if (col.nullable) {
          data[col.name] = null;
        }
        return;
      }
      if (col.type.includes('int') || col.type.includes('float') || col.type.includes('numeric') || col.type.includes('decimal') || col.type === 'real' || col.type === 'double') {
        data[col.name] = Number(val);
      } else if (col.type === 'bool' || col.type === 'boolean') {
        data[col.name] = val === 'true' || val === true;
      } else if (col.type === 'json' || col.type === 'jsonb') {
        try {
          data[col.name] = JSON.parse(val);
        } catch {
          data[col.name] = val;
        }
      } else {
        data[col.name] = val;
      }
    });
    onSave(data);
  };

  const getInputType = (colType) => {
    if (colType.includes('int') || colType.includes('float') || colType.includes('numeric') || colType.includes('decimal') || colType === 'real' || colType === 'double') return 'number';
    if (colType.includes('bool')) return 'select';
    if (colType.includes('timestamp') || colType.includes('date')) return 'datetime-local';
    if (colType === 'json' || colType === 'jsonb') return 'textarea';
    if (colType === 'text' || colType.includes('varchar') && (schema.find((c) => c.type === colType)?.maxLength || 0) > 255) return 'textarea';
    return 'text';
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
      <div className='absolute inset-0 bg-black/50 backdrop-blur-sm' onClick={onClose} />
      <div className='relative bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-border'>
        <div className='flex items-center justify-between px-6 py-4 border-b border-border'>
          <h3 className='text-lg font-semibold text-foreground'>
            {isEdit ? 'Edit Row' : 'Add Row'}
          </h3>
          <button onClick={onClose} className='p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='flex-1 overflow-y-auto px-6 py-4'>
          <div className='space-y-4'>
            {editableColumns.map((col) => {
              const inputType = getInputType(col.type);
              const isPk = primaryKeys.includes(col.name);
              const isDisabledPk = isEdit && isPk;

              return (
                <div key={col.name}>
                  <label className='flex items-center gap-2 text-sm font-medium text-foreground mb-1.5'>
                    {col.name}
                    {isPk && (
                      <span className='text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono'>
                        PK
                      </span>
                    )}
                    <span className='text-[10px] text-muted-foreground font-mono'>{col.type}</span>
                    {col.nullable && (
                      <span className='text-[10px] text-muted-foreground'>nullable</span>
                    )}
                  </label>

                  {inputType === 'select' ? (
                    <select
                      value={String(formData[col.name] ?? '')}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.value })}
                      disabled={isDisabledPk}
                      className='w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-sm'
                    >
                      <option value=''>Select...</option>
                      <option value='true'>true</option>
                      <option value='false'>false</option>
                    </select>
                  ) : inputType === 'textarea' ? (
                    <textarea
                      value={typeof formData[col.name] === 'object' ? JSON.stringify(formData[col.name], null, 2) : String(formData[col.name] ?? '')}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.value })}
                      disabled={isDisabledPk}
                      rows={3}
                      className='w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm resize-y'
                    />
                  ) : (
                    <input
                      type={inputType}
                      value={String(formData[col.name] ?? '')}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.value })}
                      disabled={isDisabledPk}
                      step={inputType === 'number' ? 'any' : undefined}
                      className='w-full px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-sm'
                    />
                  )}
                </div>
              );
            })}
          </div>
        </form>

        <div className='flex justify-end gap-3 px-6 py-4 border-t border-border'>
          <button
            type='button'
            onClick={onClose}
            className='px-4 py-2 text-sm font-medium text-foreground bg-white dark:bg-gray-700 border border-input rounded-lg hover:bg-muted/50 transition-colors'
          >
            Cancel
          </button>
          <button
            type='submit'
            onClick={handleSubmit}
            className='px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors'
          >
            {isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

const DB_TABS = [
  { id: 'viewer', label: 'DB Viewer', icon: Database },
  { id: 'migration', label: 'Schema Migration', icon: RefreshCw },
  { id: 'init-schema', label: 'Init Schema', icon: Plus },
  { id: 'backup', label: 'Backup / Restore', icon: Server },
  { id: 'reset', label: 'Reset', icon: AlertTriangle },
  { id: 'schema-view', label: 'Schema View', icon: Eye },
  { id: 'size', label: 'Capacity', icon: BarChart3 },
];

const dbResetTableOptions = [
  { key: 'chat_history', label: 'chat_history', description: 'Main chat history (/)' },
  { key: 'chat_rooms', label: 'chat_rooms', description: 'Main chat room metadata (/)' },
  { key: 'messages', label: 'messages', description: 'Admin message logs (/admin/messages)' },
  { key: 'chat_files', label: 'chat_files', description: 'Chat attachment metadata' },
  { key: 'model_logs', label: 'model_logs', description: 'Model call logs and status data' },
  { key: 'model_server_error_history', label: 'model_server_error_history', description: 'Model server error history' },
  { key: 'model_server_status', label: 'model_server_status', description: 'Model server status and health' },
  { key: 'external_api_prompts', label: 'external_api_prompts', description: 'External API prompt records' },
  { key: 'external_api_logs', label: 'external_api_logs', description: 'External API call logs' },
  { key: 'api_tokens', label: 'api_tokens', description: 'API token management data' },
  { key: 'notices', label: 'notices', description: 'Notice data' },
  { key: 'user_chats', label: 'user_chats', description: 'Chat widget data' },
  { key: 'qa_logs', label: 'qa_logs', description: 'Internal Q&A logs' },
  { key: 'app_error_logs', label: 'app_error_logs', description: 'Application error logs' },
];

export default function DatabasePage() {
  const { alert, confirm } = useAlert();
  const { isReadOnly } = useAdminAuth();

  const [activeTab, setActiveTab] = useState('viewer');

  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('');

  const [selectedTable, setSelectedTable] = useState(null);
  const [schema, setSchema] = useState([]);
  const [primaryKeys, setPrimaryKeys] = useState([]);
  const [data, setData] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [searchText, setSearchText] = useState('');
  const [searchColumn, setSearchColumn] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [schemaOpen, setSchemaOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [migrationResult, setMigrationResult] = useState(null);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [initSchemaResult, setInitSchemaResult] = useState(null);
  const [dbResetType, setDbResetType] = useState('partial');
  const [dbResetTables, setDbResetTables] = useState(new Set());
  const [dbResetConfirmText, setDbResetConfirmText] = useState('');
  const [dbResetResult, setDbResetResult] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreMode, setRestoreMode] = useState('data');
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [savingSection, setSavingSection] = useState(null);

  // Junk log purge state
  const [purgePreview, setPurgePreview] = useState(null);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);

  // Capacity analysis tab state
  const [sizeData, setSizeData] = useState(null);
  const [sizeLoading, setSizeLoading] = useState(false);
  const [sizeSelectedTable, setSizeSelectedTable] = useState(null);
  const [sizeColumnData, setSizeColumnData] = useState(null);
  const [sizeColumnLoading, setSizeColumnLoading] = useState(false);
  const [vacuumLoading, setVacuumLoading] = useState(null);

  const searchTimerRef = useRef(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchText]);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}`,
    'Content-Type': 'application/json',
  }), []);

  const fetchTables = useCallback(async () => {
    try {
      setTablesLoading(true);
      const res = await fetch('/api/admin/database', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch table list');
      const json = await res.json();
      setTables(json.tables || []);
    } catch (err) {
      logger.error('Failed to fetch table list:', err);
      alert(err.message || 'Failed to load table list.', 'error', 'Load failed');
    } finally {
      setTablesLoading(false);
    }
  }, [authHeaders, alert]);

  useEffect(() => {
    fetchTables();
    fetchMigrationStatus();
  }, [fetchTables]);

  const fetchMigrationStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/migrate-models', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const responseData = await response.json();
      setMigrationStatus(responseData);
    } catch (error) {
      logger.warn('Failed to fetch schema migration status:', error);
    }
  };

  const runModelMigration = async () => {
    const approved = await confirm(
      'Run model schema migration now?',
      'Schema Migration'
    );
    if (!approved) return;

    try {
      setSavingSection('db-migration');
      setMigrationResult(null);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/migrate-models', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Migration failed');
      }

      const responseData = await response.json();
      setMigrationResult(responseData);
      setMigrationStatus(responseData);
      alert(responseData.message || 'Migration completed.', 'success', 'Complete');
    } catch (error) {
      logger.error('Migration failed:', error);
      alert(error.message || 'Migration failed.', 'error', 'Failed');
    } finally {
      setSavingSection(null);
    }
  };

  const handleBackup = async () => {
    try {
      setBackupLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/db-backup', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Backup failed');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `hanimo-webui-backup-${Date.now()}.sql`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      alert('Backup file downloaded.', 'success', 'Backup');
    } catch (error) {
      alert(error.message || 'Backup failed.', 'error', 'Backup failed');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      alert('Select a backup file first.', 'warning', 'File required');
      return;
    }

    const modeLabel = restoreMode === 'full'
      ? 'Full restore (schema + data overwrite)'
      : 'Data-only restore (keep current schema)';
    const warningText = restoreMode === 'full'
      ? 'This will fully overwrite the current database. This cannot be undone.'
      : 'This restores data only for matching tables and columns in the current schema.';

    const approved = await confirm(
      `${modeLabel}\n\n${warningText}\n\nFile: ${restoreFile.name}\n\nContinue?`,
      'Restore Database'
    );
    if (!approved) return;

    try {
      setRestoreLoading(true);
      setRestoreResult(null);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', restoreFile);
      formData.append('mode', restoreMode);

      const response = await fetch('/api/admin/db-restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || 'Restore failed');
      }

      setRestoreResult(responseData);
      setRestoreFile(null);
      alert(responseData.message || 'Restore completed.', 'success', 'Restore');
    } catch (error) {
      alert(error.message || 'Restore failed.', 'error', 'Restore failed');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleInitSchema = async () => {
    const approved = await confirm(
      'Create all missing tables in the current database?',
      'Initialize Schema'
    );
    if (!approved) return;

    try {
      setSavingSection('init-schema');
      setInitSchemaResult(null);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/init-schema', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Schema initialization failed');
      }

      const responseData = await response.json();
      setInitSchemaResult(responseData);
      alert(responseData.message || 'Schema initialization completed.', 'success', 'Complete');
    } catch (error) {
      alert(error.message || 'Schema initialization failed.', 'error', 'Failed');
    } finally {
      setSavingSection(null);
    }
  };

  const toggleDbResetTable = (tableKey) => {
    setDbResetTables((previous) => {
      const next = new Set(previous);
      if (next.has(tableKey)) {
        next.delete(tableKey);
      } else {
        next.add(tableKey);
      }
      return next;
    });
  };

  const resetDatabase = async () => {
    const isAllReset = dbResetType === 'all';
    const warningText = isAllReset
      ? 'All non-core data will be removed. This cannot be undone.'
      : 'Selected table data will be permanently deleted.';
    const approved = await confirm(
      `Are you sure?\n${warningText}`,
      isAllReset ? 'Full Database Reset' : 'Partial Database Reset'
    );
    if (!approved) return;

    if (dbResetConfirmText.trim().toUpperCase() !== 'RESET') {
      alert('Type RESET to continue.', 'error', 'Confirmation required');
      return;
    }

    if (!isAllReset && dbResetTables.size === 0) {
      alert('Select at least one table to reset.', 'warning', 'Selection required');
      return;
    }

    try {
      setSavingSection('db-reset');
      setDbResetResult(null);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/db-reset', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: isAllReset ? 'all' : 'partial',
          tables: isAllReset ? undefined : Array.from(dbResetTables),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Database reset failed');
      }

      const responseData = await response.json();
      setDbResetResult(responseData);
      alert(responseData.message || 'Database reset completed.', 'success', 'Complete');
      setDbResetConfirmText('');
      setDbResetTables(new Set());
      fetchTables();
    } catch (error) {
      logger.error('Database reset failed:', error);
      alert(error.message || 'Database reset failed.', 'error', 'Failed');
    } finally {
      setSavingSection(null);
    }
  };

  const fetchTableData = useCallback(async () => {
    if (!selectedTable) return;
    try {
      setDataLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (sortCol) {
        params.set('sort', sortCol);
        params.set('dir', sortDir);
      }
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
        if (searchColumn) params.set('column', searchColumn);
      }
      const res = await fetch(
        `/api/admin/database/${encodeURIComponent(selectedTable)}?${params}`,
        { headers: authHeaders }
      );
      if (!res.ok) throw new Error('Failed to fetch table data');
      const json = await res.json();
      setSchema(json.schema || []);
      setPrimaryKeys(json.primaryKeys || []);
      setData(json.data || []);
      setTotalRows(json.pagination?.totalRows || 0);
      setTotalPages(json.pagination?.totalPages || 0);
    } catch (err) {
      logger.error('Failed to fetch table data:', err);
      alert(err.message || 'Failed to load table data.', 'error', 'Load failed');
    } finally {
      setDataLoading(false);
    }
  }, [selectedTable, page, limit, sortCol, sortDir, debouncedSearch, searchColumn, authHeaders, alert]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  // Junk log purge handlers
  const fetchPurgePreview = useCallback(async () => {
    try {
      setPurgeLoading(true);
      setPurgeResult(null);
      const res = await fetch('/api/admin/database/purge-junk', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setPurgePreview(json);
    } catch (err) {
      alert(err.message, 'error', 'Fetch failed');
    } finally {
      setPurgeLoading(false);
    }
  }, [authHeaders, alert]);

  const executePurge = useCallback(async () => {
    const confirmed = await confirm(
      'Remove all junk logs? (4xx errors, duplicates, heartbeat, normal response raw data)',
      'Purge Junk Logs'
    );
    if (!confirmed) return;
    try {
      setPurgeLoading(true);
      const res = await fetch('/api/admin/database/purge-junk', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Deletion failed');
      const json = await res.json();
      setPurgeResult(json);
      setPurgePreview(null);
      alert('Junk logs have been purged.', 'success', 'Complete');
      fetchTables();
    } catch (err) {
      alert(err.message, 'error', 'Deletion failed');
    } finally {
      setPurgeLoading(false);
    }
  }, [authHeaders, alert, confirm, fetchTables]);

  // Capacity analysis handlers
  const fetchSizeData = useCallback(async () => {
    try {
      setSizeLoading(true);
      setSizeData(null);
      setSizeSelectedTable(null);
      setSizeColumnData(null);
      const res = await fetch('/api/admin/database/size', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to query capacity');
      const json = await res.json();
      setSizeData(json);
    } catch (err) {
      logger.error('Failed to query capacity:', err);
      alert(err.message || 'Failed to load capacity data.', 'error', 'Fetch failed');
    } finally {
      setSizeLoading(false);
    }
  }, [authHeaders, alert]);

  const vacuumFullTable = useCallback(async (tableName) => {
    const confirmed = await confirm(
      `Run VACUUM FULL on "${tableName}"?\nThe table will be temporarily inaccessible during execution.`,
      'Reclaim Space (VACUUM FULL)'
    );
    if (!confirmed) return;
    try {
      setVacuumLoading(tableName);
      const res = await fetch('/api/admin/database/size', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ table: tableName }),
      });
      if (!res.ok) throw new Error('VACUUM FULL failed');
      const json = await res.json();
      alert(
        `${tableName}: ${json.before.pretty} → ${json.after.pretty} (${json.freedPretty} freed)`,
        'success',
        'Space Reclaimed'
      );
      fetchSizeData();
    } catch (err) {
      alert(err.message, 'error', 'VACUUM Failed');
    } finally {
      setVacuumLoading(null);
    }
  }, [authHeaders, alert, confirm, fetchSizeData]);

  const fetchColumnSize = useCallback(async (tableName) => {
    try {
      setSizeColumnLoading(true);
      setSizeSelectedTable(tableName);
      setSizeColumnData(null);
      const res = await fetch(`/api/admin/database/size?table=${encodeURIComponent(tableName)}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to query column sizes');
      const json = await res.json();
      setSizeColumnData(json.columns);
    } catch (err) {
      logger.error('Failed to query column sizes:', err);
      alert(err.message || 'Failed to load column data.', 'error', 'Fetch failed');
    } finally {
      setSizeColumnLoading(false);
    }
  }, [authHeaders, alert]);

  const handleSelectTable = useCallback((tableName) => {
    setSelectedTable(tableName);
    setPage(1);
    setSortCol('');
    setSortDir('asc');
    setSearchText('');
    setSearchColumn('');
    setDebouncedSearch('');
    setSchemaOpen(false);
    setMobileSidebarOpen(false);
  }, []);

  const handleSort = useCallback((colName) => {
    setSortCol((prev) => {
      if (prev === colName) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return colName;
      }
      setSortDir('asc');
      return colName;
    });
    setPage(1);
  }, []);

  const handleAddRow = useCallback(async (rowData) => {
    try {
      const res = await fetch(`/api/admin/database/${encodeURIComponent(selectedTable)}`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ row: rowData }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add row');
      alert('Row added.', 'success', 'Add complete');
      setShowAddModal(false);
      fetchTableData();
      fetchTables();
    } catch (err) {
      logger.error('Failed to add row:', err);
      alert(err.message || 'Failed to add row.', 'error', 'Add failed');
    }
  }, [selectedTable, authHeaders, alert, fetchTableData, fetchTables]);

  const handleEditRow = useCallback(async (rowData) => {
    try {
      const pk = {};
      primaryKeys.forEach((k) => {
        pk[k] = editRow[k];
      });
      const res = await fetch(`/api/admin/database/${encodeURIComponent(selectedTable)}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ primaryKey: pk, row: rowData }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update row');
      alert('Row updated.', 'success', 'Update complete');
      setEditRow(null);
      fetchTableData();
    } catch (err) {
      logger.error('Failed to update row:', err);
      alert(err.message || 'Failed to update row.', 'error', 'Update failed');
    }
  }, [selectedTable, primaryKeys, editRow, authHeaders, alert, fetchTableData]);

  const handleDeleteRow = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const pk = {};
      primaryKeys.forEach((k) => {
        pk[k] = deleteTarget[k];
      });
      const res = await fetch(`/api/admin/database/${encodeURIComponent(selectedTable)}`, {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({ primaryKey: pk }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete row');
      alert('Row deleted.', 'success', 'Delete complete');
      setDeleteTarget(null);
      fetchTableData();
      fetchTables();
    } catch (err) {
      logger.error('Failed to delete row:', err);
      alert(err.message || 'Failed to delete row.', 'error', 'Delete failed');
    }
  }, [selectedTable, primaryKeys, deleteTarget, authHeaders, alert, fetchTableData, fetchTables]);

  const filteredTables = useMemo(() => {
    if (!tableFilter.trim()) return tables;
    const q = tableFilter.toLowerCase();
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, tableFilter]);

  const paginationRange = useMemo(() => {
    const range = [];
    const maxButtons = 5;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) {
      range.push(i);
    }
    return range;
  }, [page, totalPages]);

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, totalRows);

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard.', 'success', 'Copy complete');
    }).catch(() => {
      alert('Copy failed.', 'error', 'Copy failed');
    });
  }, [alert]);

  useEffect(() => {
    if (showAddModal || editRow || deleteTarget) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showAddModal, editRow, deleteTarget]);

  return (
    <div className='space-y-0 w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto'>
      <div className='pb-4 mb-4' style={{ borderBottom: '1px solid var(--hn-border)' }}>
        <div className='flex items-center justify-between flex-wrap gap-4'>
          <div>
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
              인프라
            </div>
            <h1
              className='font-bold flex items-center gap-2'
              style={{
                fontSize: 'clamp(22px, 2.6vw, 28px)',
                letterSpacing: '-0.02em',
                color: 'var(--hn-fg)',
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              데이터베이스 관리
            </h1>
            <p
              style={{
                marginTop: 6,
                fontSize: 13.5,
                color: 'var(--hn-fg-muted)',
                maxWidth: 640,
              }}
            >
              테이블을 조회하고 스키마 유지보수 작업을 실행합니다.
            </p>
          </div>
          <div className='flex items-center gap-3'>
            {!isReadOnly && (
              <button
                onClick={purgePreview ? () => setPurgePreview(null) : fetchPurgePreview}
                disabled={purgeLoading}
                className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/50 transition-colors'
              >
                {purgeLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                Purge Junk Logs
              </button>
            )}
            {activeTab === 'viewer' && (
              <>
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className='lg:hidden p-2 rounded-lg border border-input hover:bg-accent text-muted-foreground transition-colors'
                >
                  <Table className='h-5 w-5' />
                </button>
                <div className='text-right hidden sm:block'>
                  <div className='text-2xl font-bold text-primary'>
                    {tables.length}
                  </div>
                  <div className='text-sm text-muted-foreground'>Total tables</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Junk log purge panel */}
      {(purgePreview || purgeResult) && (
        <div className='mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg overflow-hidden'>
          <div className='px-4 py-3 border-b border-amber-200 dark:border-amber-700 flex items-center justify-between'>
            <h3 className='text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2'>
              <Trash2 className='h-4 w-4' />
              Purge Junk Logs
            </h3>
            <button
              onClick={() => { setPurgePreview(null); setPurgeResult(null); }}
              className='p-1 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-[var(--hn-warn)]'
            >
              <X className='h-4 w-4' />
            </button>
          </div>

          {purgePreview && (
            <div className='p-4 space-y-3'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                {purgePreview.targets?.map((t) => (
                  <div key={t.id} className='bg-card rounded-lg border border-amber-100 dark:border-amber-800/50 p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <span className='text-xs font-mono font-bold text-foreground'>{t.table}</span>
                      <span className='text-xs font-semibold text-[var(--hn-warn)]'>{t.sizePretty}</span>
                    </div>
                    <p className='text-xs text-muted-foreground'>{t.description}</p>
                    <div className='mt-1 text-xs text-muted-foreground'>
                      {t.count?.toLocaleString()} rows {t.id === 'external_api_jsonb' ? '(NULL-ify)' : '(delete)'}
                    </div>
                  </div>
                ))}
              </div>
              <div className='flex items-center justify-between pt-2 border-t border-amber-200 dark:border-amber-700'>
                <div className='text-sm text-amber-800 dark:text-amber-300'>
                  Total <strong>{purgePreview.summary?.totalCount?.toLocaleString()}</strong> rows · <strong>{purgePreview.summary?.totalPretty}</strong> estimated
                </div>
                <button
                  onClick={executePurge}
                  disabled={purgeLoading || purgePreview.summary?.totalCount === 0}
                  className='inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors'
                >
                  {purgeLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                  {purgeLoading ? 'Processing...' : 'Execute Purge'}
                </button>
              </div>
            </div>
          )}

          {purgeResult && (
            <div className='p-4 space-y-2'>
              <div className='text-sm font-medium text-[var(--hn-good)]'>Completed</div>
              {purgeResult.results?.map((r) => (
                <div key={r.id} className='flex items-center justify-between text-xs text-muted-foreground'>
                  <span className='font-mono'>{r.table} ({r.id})</span>
                  <span className='font-semibold'>
                    {r.error ? (
                      <span className='text-[var(--hn-error)]'>{r.error}</span>
                    ) : r.deletedRows != null ? (
                      `${r.deletedRows.toLocaleString()} rows deleted`
                    ) : r.updatedRows != null ? (
                      `${r.updatedRows.toLocaleString()} rows NULL-ified`
                    ) : '-'}
                  </span>
                </div>
              ))}
              {purgeResult.vacuumed?.length > 0 && (
                <div className='text-[11px] text-muted-foreground mt-1'>
                  VACUUM completed: {purgeResult.vacuumed.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className='border-b border-border mb-6'>
        <nav className='flex gap-1 -mb-px overflow-x-auto' aria-label='Database management tabs'>
          {DB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <tab.icon className='h-4 w-4' />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'viewer' && (
        <>
          <div className='flex gap-4 min-h-[calc(100vh-220px)]'>
            {mobileSidebarOpen && (
              <div className='fixed inset-0 z-40 lg:hidden'>
                <div className='absolute inset-0 bg-black/40' onClick={() => setMobileSidebarOpen(false)} />
                <div className='absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border flex flex-col shadow-xl z-50'>
                  <div className='flex items-center justify-between p-3 border-b border-border'>
                    <span className='text-sm font-semibold text-foreground'>Table list</span>
                    <button onClick={() => setMobileSidebarOpen(false)} className='p-1 rounded hover:bg-accent'>
                      <X className='h-4 w-4 text-muted-foreground' />
                    </button>
                  </div>
                  <div className='p-3'>
                    <div className='relative'>
                      <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
                      <input
                        type='text'
                        placeholder='Search tables...'
                        value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        className='w-full pl-8 pr-3 py-2 text-sm border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground'
                      />
                    </div>
                  </div>
                  <div className='flex-1 overflow-y-auto px-2 pb-2'>
                    {filteredTables.map((t) => (
                      <button
                        key={t.name}
                        onClick={() => handleSelectTable(t.name)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors mb-0.5 ${
                          selectedTable === t.name
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        <span className='truncate'>{t.name}</span>
                        <span className='flex-shrink-0 ml-2 text-[11px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>
                          {t.rowCount?.toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className='p-3 border-t border-border text-xs text-muted-foreground text-center'>
                    {filteredTables.length} / {tables.length} tables
                  </div>
                </div>
              </div>
            )}

            <div className='hidden lg:flex w-64 flex-shrink-0 flex-col bg-card rounded-lg border border-border overflow-hidden'>
              <div className='p-3 border-b border-border'>
                <div className='relative'>
                  <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
                  <input
                    type='text'
                    placeholder='Search tables...'
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                    className='w-full pl-8 pr-3 py-2 text-sm border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground'
                  />
                </div>
              </div>

              <div className='flex-1 overflow-y-auto px-2 py-2'>
                {tablesLoading ? (
                  <div className='space-y-2 px-2'>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className='h-9 bg-muted rounded-lg animate-pulse' />
                    ))}
                  </div>
                ) : filteredTables.length === 0 ? (
                  <div className='text-center py-8 text-sm text-muted-foreground'>
                    No tables found
                  </div>
                ) : (
                  filteredTables.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => handleSelectTable(t.name)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors mb-0.5 ${
                        selectedTable === t.name
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      <span className='truncate'>{t.name}</span>
                      <span className='flex-shrink-0 ml-2 text-[11px] tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>
                        {t.rowCount?.toLocaleString()}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className='p-3 border-t border-border text-xs text-muted-foreground text-center'>
                {filteredTables.length} / {tables.length} tables
              </div>
            </div>

            <div className='flex-1 min-w-0 flex flex-col'>
              {!selectedTable ? (
                <div className='flex-1 flex items-center justify-center bg-card rounded-lg border border-border'>
                  <div className='text-center'>
                    <Database className='mx-auto h-16 w-16 text-gray-300 dark:text-muted-foreground' />
                    <h3 className='mt-3 text-lg font-medium text-muted-foreground'>
                      Select a table
                    </h3>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      Choose a table from the list to inspect and edit records.
                    </p>
                  </div>
                </div>
              ) : (
                <div className='flex flex-col gap-3'>
              <div className='bg-card rounded-lg border border-border px-4 py-3'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='flex items-center gap-3'>
                    <h2 className='text-lg font-bold text-foreground flex items-center gap-2'>
                      <Table className='h-5 w-5 text-primary' />
                      {selectedTable}
                    </h2>
                    <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded'>
                      {totalRows.toLocaleString()} rows
                    </span>
                    <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded'>
                      {schema.length} columns
                    </span>
                  </div>
                  {getTableDescription(selectedTable) && (
                    <p className='w-full text-xs text-muted-foreground mt-1'>
                      {getTableDescription(selectedTable)}
                    </p>
                  )}

                  <div className='flex items-center gap-2'>
                    <button
                      onClick={() => setSchemaOpen(!schemaOpen)}
                      className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-input text-muted-foreground hover:bg-accent transition-colors'
                    >
                      {schemaOpen ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                      Schema
                    </button>
                    <button
                      onClick={() => { fetchTableData(); fetchTables(); }}
                      className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-input text-muted-foreground hover:bg-accent transition-colors'
                    >
                      <RefreshCw className='h-3.5 w-3.5' />
                      Refresh
                    </button>
                    {!isReadOnly && (
                      <button
                        onClick={() => setShowAddModal(true)}
                        className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors'
                      >
                        <Plus className='h-3.5 w-3.5' />
                        Add row
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {schemaOpen && (
                <div className='bg-card rounded-lg border border-border overflow-hidden'>
                  <div className='px-4 py-2 border-b border-border bg-muted/50'>
                    <h3 className='text-sm font-semibold text-foreground flex items-center gap-1.5'>
                      <Hash className='h-3.5 w-3.5' />
                      Schema details
                    </h3>
                  </div>
                  <div className='overflow-x-auto'>
                    <table className='w-full text-sm'>
                      <thead>
                        <tr className='bg-muted/50'>
                          <th className='text-left px-4 py-2 font-medium text-muted-foreground'>Column</th>
                          <th className='text-left px-4 py-2 font-medium text-muted-foreground'>Type</th>
                          <th className='text-left px-4 py-2 font-medium text-muted-foreground'>NULL</th>
                          <th className='text-left px-4 py-2 font-medium text-muted-foreground'>Default</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-border'>
                        {schema.map((col) => (
                          <tr key={col.name} className='hover:bg-muted/50'>
                            <td className='px-4 py-1.5'>
                              <Tooltip text={getColumnDescription(selectedTable, col.name) || col.type}>
                                <span className={`font-mono text-xs ${primaryKeys.includes(col.name) ? 'text-primary font-bold' : 'text-foreground'}`}>
                                  {col.name}
                                </span>
                                {primaryKeys.includes(col.name) && (
                                  <span className='ml-1.5 text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary'>
                                    PK
                                  </span>
                                )}
                              </Tooltip>
                            </td>
                            <td className='px-4 py-1.5 font-mono text-xs text-muted-foreground'>{col.type}</td>
                            <td className='px-4 py-1.5'>
                              <span className={`text-xs ${col.nullable ? 'text-[var(--hn-good)]' : 'text-[var(--hn-error)]'}`}>
                                {col.nullable ? 'YES' : 'NO'}
                              </span>
                            </td>
                            <td className='px-4 py-1.5 font-mono text-xs text-muted-foreground max-w-[200px] truncate'>
                              {col.defaultValue || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className='bg-card rounded-lg border border-border px-4 py-3'>
                <div className='flex flex-col sm:flex-row gap-3'>
                  <div className='relative flex-1'>
                    <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                    <input
                      type='text'
                      placeholder='Search data...'
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className='w-full pl-10 pr-4 py-2 text-sm border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground'
                    />
                  </div>
                  <select
                    value={searchColumn}
                    onChange={(e) => { setSearchColumn(e.target.value); setPage(1); }}
                    className='px-3 py-2 text-sm border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground min-w-[140px]'
                  >
                    <option value=''>All columns</option>
                    {schema.map((col) => (
                      <option key={col.name} value={col.name}>{col.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className='bg-card rounded-lg border border-border overflow-hidden flex-1'>
                {dataLoading ? (
                  <div className='flex items-center justify-center h-48'>
                    <Loader2 className='h-8 w-8 text-primary animate-spin' />
                  </div>
                ) : data.length === 0 ? (
                  <div className='text-center py-16'>
                    <Database className='mx-auto h-12 w-12 text-gray-300 dark:text-muted-foreground' />
                    <h3 className='mt-2 text-sm font-medium text-muted-foreground'>
                      No data found
                    </h3>
                    {debouncedSearch && (
                      <p className='mt-1 text-xs text-muted-foreground'>Try a different search.</p>
                    )}
                  </div>
                ) : (
                  <div className='overflow-x-auto'>
                    <table className='w-full text-sm'>
                      <thead>
                        <tr className='bg-muted/50 border-b border-border'>
                          {schema.map((col) => {
                            const isSorted = sortCol === col.name;
                            const isPk = primaryKeys.includes(col.name);
                            return (
                              <th
                                key={col.name}
                                className='text-left px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:bg-accent transition-colors select-none whitespace-nowrap'
                                onClick={() => handleSort(col.name)}
                              >
                                <Tooltip text={getColumnDescription(selectedTable, col.name) || col.type}>
                                  <span className='flex items-center gap-1'>
                                    <span className={isPk ? 'text-primary font-bold' : ''}>
                                      {col.name}
                                    </span>
                                    {isPk && (
                                      <span className='text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary'>
                                        PK
                                      </span>
                                    )}
                                    {isSorted ? (
                                      sortDir === 'asc' ? (
                                        <ChevronUp className='h-3 w-3 text-primary' />
                                      ) : (
                                        <ChevronDown className='h-3 w-3 text-primary' />
                                      )
                                    ) : (
                                      <ChevronUp className='h-3 w-3 text-muted-foreground opacity-70' />
                                    )}
                                  </span>
                                </Tooltip>
                              </th>
                            );
                          })}
                          {!isReadOnly && (
                            <th className='text-right px-4 py-2.5 font-medium text-muted-foreground sticky right-0 bg-muted/50 whitespace-nowrap min-w-[100px]'>
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-border'>
                        {data.map((row, rowIdx) => {
                          const rowKey = primaryKeys.length > 0
                            ? primaryKeys.map((k) => row[k]).join('-')
                            : rowIdx;
                          return (
                            <tr key={rowKey} className='hover:bg-muted/50 transition-colors'>
                              {schema.map((col) => {
                                const cellDesc = getColumnDescription(selectedTable, col.name);
                                const cellTooltip = cellDesc
                                  ? `${col.name} - ${cellDesc}`
                                  : `${col.name} (${col.type})`;
                                return (
                                  <td
                                    key={col.name}
                                    className='px-4 py-2 text-foreground max-w-[300px] align-top'
                                  >
                                    <Tooltip text={cellTooltip} delay={300} className='w-full'>
                                      <CellValue
                                        value={row[col.name]}
                                        colType={col.type}
                                        isPrimaryKey={primaryKeys.includes(col.name)}
                                      />
                                    </Tooltip>
                                  </td>
                                );
                              })}
                              {!isReadOnly && (
                                <td className='px-4 py-2 text-right sticky right-0 bg-card whitespace-nowrap'>
                                  <div className='flex items-center justify-end gap-1'>
                                    <button
                                      onClick={() => setEditRow(row)}
                                      className='p-1.5 text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg transition-colors'
                                      title='Edit'
                                    >
                                      <Edit2 className='h-3.5 w-3.5' />
                                    </button>
                                    <button
                                      onClick={() => setDeleteTarget(row)}
                                      className='p-1.5 text-[var(--hn-error)] hover:bg-[var(--hn-error-soft)] rounded-lg transition-colors'
                                      title='Delete'
                                    >
                                      <Trash2 className='h-3.5 w-3.5' />
                                    </button>
                                    <button
                                      onClick={() => copyToClipboard(JSON.stringify(row, null, 2))}
                                      className='p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors'
                                      title='Copy JSON'
                                    >
                                      <Copy className='h-3.5 w-3.5' />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {totalPages > 0 && data.length > 0 && (
                <div className='bg-card rounded-lg border border-border px-4 py-3'>
                  <div className='flex flex-col sm:flex-row items-center justify-between gap-3'>
                    <div className='text-sm text-muted-foreground'>
                      Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {totalRows.toLocaleString()} rows
                    </div>

                    <div className='flex items-center gap-2'>
                      <select
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                        className='px-2 py-1.5 text-xs border border-input rounded-lg bg-background text-foreground'
                      >
                          <option value={25}>25 rows</option>
                          <option value={50}>50 rows</option>
                          <option value={100}>100 rows</option>
                      </select>

                      <div className='flex items-center'>
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                          className='p-1.5 rounded-lg border border-input hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                        >
                          <ChevronLeft className='h-4 w-4 text-muted-foreground' />
                        </button>

                        <div className='flex items-center mx-1'>
                          {paginationRange.map((p) => (
                            <button
                              key={p}
                              onClick={() => setPage(p)}
                              className={`min-w-[32px] h-8 text-xs rounded-lg transition-colors ${
                                p === page
                                  ? 'bg-primary text-primary-foreground font-medium'
                                  : 'text-muted-foreground hover:bg-accent'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page >= totalPages}
                          className='p-1.5 rounded-lg border border-input hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                        >
                          <ChevronRight className='h-4 w-4 text-muted-foreground' />
                        </button>
                      </div>

                      <span className='text-xs text-muted-foreground'>
                        {page} / {totalPages}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
              )}
            </div>
          </div>

          {showAddModal && (
            <RowFormModal
              schema={schema}
              primaryKeys={primaryKeys}
              onSave={handleAddRow}
              onClose={() => setShowAddModal(false)}
              isEdit={false}
            />
          )}

          {editRow && (
            <RowFormModal
              schema={schema}
              primaryKeys={primaryKeys}
              row={editRow}
              onSave={handleEditRow}
              onClose={() => setEditRow(null)}
              isEdit={true}
            />
          )}

          {deleteTarget && (
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
              <div className='absolute inset-0 bg-black/50 backdrop-blur-sm' onClick={() => setDeleteTarget(null)} />
              <div className='relative bg-card rounded-xl shadow-2xl w-full max-w-md p-6 border border-border'>
                <div className='flex items-start gap-4'>
                  <div className='flex-shrink-0 w-10 h-10 rounded-full bg-[var(--hn-error-soft)] flex items-center justify-center'>
                    <AlertTriangle className='h-5 w-5 text-[var(--hn-error)]' />
                  </div>
                  <div className='flex-1'>
                    <h3 className='text-lg font-semibold text-foreground'>
                      Delete this row?
                    </h3>
                    <div className='mt-2 space-y-1'>
                      {primaryKeys.map((k) => (
                        <p key={k} className='text-sm text-muted-foreground'>
                          <span className='font-medium text-foreground'>{k}:</span>{' '}
                          {String(deleteTarget[k])}
                        </p>
                      ))}
                    </div>
                    <p className='mt-3 text-sm text-muted-foreground'>
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
                <div className='flex justify-end gap-3 mt-6'>
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className='px-4 py-2 text-sm font-medium text-foreground bg-white dark:bg-gray-700 border border-input rounded-lg hover:bg-muted/50 transition-colors'
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteRow}
                    className='px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg transition-colors'
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'migration' && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <RefreshCw className='h-5 w-5 text-muted-foreground' />
              <h2 className='text-lg font-semibold text-foreground'>
                Schema Migration
              </h2>
            </div>
            <div className='flex items-center gap-2'>
              <button
                onClick={fetchMigrationStatus}
                disabled={savingSection === 'db-migration'}
                className='inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-input text-foreground hover:bg-accent'
              >
                <RefreshCw className='h-3.5 w-3.5' />
                Check status
              </button>
              {!isReadOnly && (
                <button
                  onClick={runModelMigration}
                  disabled={savingSection === 'db-migration'}
                  className='inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${savingSection === 'db-migration' ? 'animate-spin' : ''}`} />
                  {savingSection === 'db-migration' ? 'Running...' : 'Run migration'}
                </button>
              )}
            </div>
          </div>
          <p className='text-sm text-muted-foreground'>
            Keep the database schema aligned with the current app version.
          </p>
          {migrationStatus && (
            <div className='text-xs text-muted-foreground'>
              Status: {migrationStatus.isUpToDate ? 'Up to date' : 'Update required'}
            </div>
          )}
          {migrationResult?.columns && (
            <div className='text-xs text-muted-foreground'>
              Current columns: {migrationResult.columns.length}
            </div>
          )}
        </div>
      )}

      {activeTab === 'init-schema' && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <Plus className='h-5 w-5 text-muted-foreground' />
              <h2 className='text-lg font-semibold text-foreground'>Init Schema</h2>
            </div>
            {!isReadOnly && (
              <button
                onClick={handleInitSchema}
                disabled={savingSection === 'init-schema'}
                className='inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
              >
                <RefreshCw className={`h-3.5 w-3.5 ${savingSection === 'init-schema' ? 'animate-spin' : ''}`} />
                {savingSection === 'init-schema' ? 'Creating...' : 'Initialize schema'}
              </button>
            )}
          </div>
          <p className='text-sm text-muted-foreground'>
            Create missing tables in this environment.
          </p>
          {initSchemaResult && <div className='text-xs text-muted-foreground'>{initSchemaResult.message}</div>}
        </div>
      )}

      {activeTab === 'backup' && (
        <div className='space-y-5'>
          <div className='flex items-center gap-3 mb-4'>
            <Server className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>Backup / Restore</h2>
          </div>

          {isReadOnly ? (
            <p className='text-sm text-muted-foreground'>Read-only users cannot run backup or restore.</p>
          ) : (
            <div className='space-y-5'>
              <div className='flex items-center justify-between p-4 bg-card rounded-lg border border-border'>
                <div>
                  <div className='font-medium text-foreground text-sm'>Download backup</div>
                  <p className='text-xs text-muted-foreground mt-1'>Export the current database to a SQL file.</p>
                </div>
                <button
                  onClick={handleBackup}
                  disabled={backupLoading}
                  className='inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
                >
                  <Download className='h-4 w-4' />
                  {backupLoading ? 'Downloading...' : 'Download'}
                </button>
              </div>

              <div className='p-4 bg-card rounded-lg border border-border space-y-4'>
                <div>
                  <div className='font-medium text-foreground text-sm'>Restore upload</div>
                  <p className='text-xs text-muted-foreground mt-1'>Upload a SQL backup and restore the database.</p>
                </div>

                <div className='flex flex-wrap items-center gap-4'>
                  <label className='inline-flex items-center gap-2 text-sm text-foreground'>
                    <input type='radio' name='restore-mode' value='data' checked={restoreMode === 'data'} onChange={() => setRestoreMode('data')} className='accent-[var(--color-primary)]' />
                    Data-only restore
                  </label>
                  <label className='inline-flex items-center gap-2 text-sm text-foreground'>
                    <input type='radio' name='restore-mode' value='full' checked={restoreMode === 'full'} onChange={() => setRestoreMode('full')} className='accent-[var(--color-primary)]' />
                    Full restore
                  </label>
                </div>

                <div className='flex items-center gap-3'>
                  <label className='flex-1'>
                    <input
                      type='file'
                      accept='.sql'
                      onChange={(e) => {
                        setRestoreFile(e.target.files?.[0] || null);
                        setRestoreResult(null);
                      }}
                      className='block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary'
                      disabled={restoreLoading}
                    />
                  </label>
                  <button
                    onClick={handleRestore}
                    disabled={restoreLoading || !restoreFile}
                    className='inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
                  >
                    <Upload className='h-4 w-4' />
                    {restoreLoading ? 'Restoring...' : 'Restore'}
                  </button>
                </div>

                {restoreResult && <div className='text-xs text-muted-foreground'>{restoreResult.message}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reset' && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <AlertTriangle className='h-5 w-5 text-[var(--hn-error)]' />
              <h2 className='text-lg font-semibold text-[var(--hn-error)]'>Database Reset</h2>
            </div>
            {!isReadOnly && (
              <button
                onClick={resetDatabase}
                disabled={savingSection === 'db-reset'}
                className='inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-[var(--hn-error)] text-white hover:brightness-95 disabled:opacity-50'
              >
                <Trash2 className='h-3.5 w-3.5' />
                {savingSection === 'db-reset' ? 'Processing...' : 'Run reset'}
              </button>
            )}
          </div>
          <p className='text-sm text-[var(--hn-error)]'>Type RESET and confirm to proceed.</p>

          <div className='space-y-4'>
            <div className='flex flex-wrap items-center gap-4'>
              <label className='inline-flex items-center gap-2 text-sm text-foreground'>
                <input type='radio' name='db-reset-type' value='partial' checked={dbResetType === 'partial'} onChange={() => setDbResetType('partial')} className='accent-[var(--hn-error)]' disabled={isReadOnly} />
                Partial reset
              </label>
              <label className='inline-flex items-center gap-2 text-sm text-foreground'>
                <input type='radio' name='db-reset-type' value='all' checked={dbResetType === 'all'} onChange={() => setDbResetType('all')} className='accent-[var(--hn-error)]' disabled={isReadOnly} />
                Full reset
              </label>
            </div>

            {dbResetType === 'partial' && (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                {dbResetTableOptions.map((tableOption) => (
                  <label key={tableOption.key} className='flex items-start gap-2 text-sm text-foreground bg-card border border-[var(--hn-error)]/30 rounded-md px-3 py-2'>
                    <input type='checkbox' checked={dbResetTables.has(tableOption.key)} onChange={() => toggleDbResetTable(tableOption.key)} className='accent-[var(--hn-error)] mt-1' disabled={isReadOnly} />
                    <div>
                      <div className='font-medium'>{tableOption.label}</div>
                      <div className='text-xs text-muted-foreground'>{tableOption.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div>
              <label className='block text-sm font-medium text-foreground mb-2'>Confirmation text (RESET)</label>
              <input
                type='text'
                value={dbResetConfirmText}
                onChange={(e) => setDbResetConfirmText(e.target.value)}
                className='w-full px-3 py-2 border border-[var(--hn-error)]/40 rounded-md bg-background text-foreground'
                placeholder='RESET'
                disabled={isReadOnly}
              />
            </div>

            {dbResetResult?.deletedTables?.length > 0 && (
              <div className='text-xs text-foreground'>
                Last processed: {dbResetResult.deletedTables.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'schema-view' && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <Globe className='h-5 w-5 text-muted-foreground' />
              <h2 className='text-lg font-semibold text-foreground'>Schema View</h2>
            </div>
            <Link href='/admin/db-schema' className='inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90'>
              Open schema page
            </Link>
          </div>
          <p className='text-sm text-muted-foreground'>Inspect current table and column structures.</p>
        </div>
      )}

      {activeTab === 'size' && (
        <div className='space-y-5'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <BarChart3 className='h-5 w-5 text-primary' />
              <h2 className='text-lg font-semibold text-foreground'>
                DB Capacity Analysis
              </h2>
            </div>
            <button
              onClick={fetchSizeData}
              disabled={sizeLoading}
              className='inline-flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors'
            >
              {sizeLoading ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='h-4 w-4' />
              )}
              {sizeLoading ? 'Analyzing...' : sizeData ? 'Refresh' : 'Analyze Capacity'}
            </button>
          </div>
          <p className='text-sm text-muted-foreground'>
            Analyze total database size, per-table size, and per-column average size. Click a table to inspect column-level details.
          </p>

          {!sizeData && !sizeLoading && (
            <div className='text-center py-16 bg-card rounded-lg border border-border'>
              <BarChart3 className='mx-auto h-16 w-16 text-gray-300 dark:text-muted-foreground' />
              <h3 className='mt-3 text-lg font-medium text-muted-foreground'>
                Start capacity analysis
              </h3>
              <p className='mt-1 text-sm text-muted-foreground'>
                Click the &quot;Analyze Capacity&quot; button above to query DB size information.
              </p>
            </div>
          )}

          {sizeLoading && (
            <div className='flex items-center justify-center py-16 bg-card rounded-lg border border-border'>
              <Loader2 className='h-8 w-8 text-primary animate-spin' />
            </div>
          )}

          {sizeData && !sizeLoading && (
            <>
              {/* DB summary cards */}
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                <div className='bg-card rounded-lg border border-border p-4'>
                  <div className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>Total DB Size</div>
                  <div className='mt-1 text-2xl font-bold text-primary'>
                    {sizeData.database.sizePretty}
                  </div>
                  <div className='mt-0.5 text-xs text-muted-foreground'>
                    {sizeData.database.name}
                  </div>
                </div>
                <div className='bg-card rounded-lg border border-border p-4'>
                  <div className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>Tables</div>
                  <div className='mt-1 text-2xl font-bold text-[var(--hn-good)]'>
                    {sizeData.tables.length}
                  </div>
                  <div className='mt-0.5 text-xs text-muted-foreground'>public schema</div>
                </div>
                <div className='bg-card rounded-lg border border-border p-4'>
                  <div className='text-xs font-medium text-muted-foreground uppercase tracking-wider'>Total Rows</div>
                  <div className='mt-1 text-2xl font-bold text-[var(--hn-warn)]'>
                    {sizeData.tables.reduce((sum, t) => sum + t.rowCount, 0).toLocaleString()}
                  </div>
                  <div className='mt-0.5 text-xs text-muted-foreground'>approximate</div>
                </div>
              </div>

              {/* Capacity distribution bar */}
              <div className='bg-card rounded-lg border border-border overflow-hidden'>
                <div className='px-4 py-3 border-b border-border bg-muted/50'>
                  <h3 className='text-sm font-semibold text-foreground'>Size Distribution</h3>
                </div>
                <div className='p-4'>
                  <div className='flex h-6 rounded-lg overflow-hidden bg-muted'>
                    {(() => {
                      const totalBytes = sizeData.tables.reduce((s, t) => s + t.totalBytes, 0) || 1;
                      const colors = [
                        'bg-[var(--hn-primary)]', 'bg-[var(--hn-info)]', 'bg-[var(--hn-good)]', 'bg-[var(--hn-warn)]',
                        'bg-[var(--hn-error)]', 'bg-[var(--hn-fg-muted)]', 'bg-[var(--hn-primary-strong)]', 'bg-[var(--hn-border-strong)]',
                        'bg-[var(--hn-surface-3)]', 'bg-[var(--hn-fg-2)]',
                      ];
                      const topTables = sizeData.tables.slice(0, 10);
                      const otherBytes = sizeData.tables.slice(10).reduce((s, t) => s + t.totalBytes, 0);
                      return (
                        <>
                          {topTables.map((t, i) => {
                            const pct = (t.totalBytes / totalBytes) * 100;
                            if (pct < 0.5) return null;
                            return (
                              <Tooltip key={t.name} text={`${t.name}: ${t.totalPretty} (${pct.toFixed(1)}%)`}>
                                <div
                                  className={`${colors[i % colors.length]} h-full transition-all hover:opacity-80`}
                                  style={{ width: `${pct}%` }}
                                />
                              </Tooltip>
                            );
                          })}
                          {otherBytes > 0 && (
                            <Tooltip text={`Other ${sizeData.tables.length - 10} tables`}>
                              <div
                                className='bg-muted-foreground h-full'
                                style={{ width: `${(otherBytes / totalBytes) * 100}%` }}
                              />
                            </Tooltip>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className='mt-2 flex flex-wrap gap-x-4 gap-y-1'>
                    {(() => {
                      const colors = [
                        'bg-[var(--hn-primary)]', 'bg-[var(--hn-info)]', 'bg-[var(--hn-good)]', 'bg-[var(--hn-warn)]',
                        'bg-[var(--hn-error)]', 'bg-[var(--hn-fg-muted)]', 'bg-[var(--hn-primary-strong)]', 'bg-[var(--hn-border-strong)]',
                        'bg-[var(--hn-surface-3)]', 'bg-[var(--hn-fg-2)]',
                      ];
                      return sizeData.tables.slice(0, 10).map((t, i) => (
                        <span key={t.name} className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${colors[i % colors.length]}`} />
                          {t.name}
                        </span>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Per-table size list */}
              <div className='bg-card rounded-lg border border-border overflow-hidden'>
                <div className='px-4 py-3 border-b border-border bg-muted/50'>
                  <h3 className='text-sm font-semibold text-foreground'>Per-table Size (click for column details)</h3>
                </div>
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='bg-muted/50'>
                        <th className='text-left px-4 py-2.5 font-medium text-muted-foreground'>Table</th>
                        <th className='text-right px-4 py-2.5 font-medium text-muted-foreground'>Total Size</th>
                        <th className='text-right px-4 py-2.5 font-medium text-muted-foreground'>Data</th>
                        <th className='text-right px-4 py-2.5 font-medium text-muted-foreground'>Index</th>
                        <th className='text-right px-4 py-2.5 font-medium text-muted-foreground'>TOAST</th>
                        <th className='text-right px-4 py-2.5 font-medium text-muted-foreground'>Rows</th>
                        <th className='text-left px-4 py-2.5 font-medium text-muted-foreground w-[200px]'>Ratio</th>
                        <th className='text-center px-4 py-2.5 font-medium text-muted-foreground'>Status</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-border'>
                      {sizeData.tables.map((t) => {
                        const maxBytes = sizeData.tables[0]?.totalBytes || 1;
                        const pct = (t.totalBytes / maxBytes) * 100;
                        const isSelected = sizeSelectedTable === t.name;
                        // Bloat detection: abnormally high avg size per row
                        const avgBytesPerRow = t.rowCount > 0 ? t.tableBytes / t.rowCount : 0;
                        const isBloated = (t.rowCount === 0 && t.tableBytes > 65536)
                          || (t.rowCount > 0 && t.rowCount < 100 && t.tableBytes > 1048576)
                          || (avgBytesPerRow > 102400);
                        return (
                          <tr
                            key={t.name}
                            onClick={() => fetchColumnSize(t.name)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-primary/10'
                                : isBloated
                                  ? 'bg-[var(--hn-error-soft)]'
                                  : 'hover:bg-muted/50'
                            }`}
                          >
                            <td className='px-4 py-2'>
                              <span className={`font-mono text-xs ${isSelected ? 'text-primary font-bold' : 'text-foreground'}`}>
                                {t.name}
                              </span>
                              {isBloated && (
                                <span className='ml-2 text-[9px] px-1.5 py-0.5 rounded bg-[var(--hn-error-soft)] text-[var(--hn-error)] font-semibold'>
                                  BLOAT
                                </span>
                              )}
                            </td>
                            <td className='px-4 py-2 text-right font-mono text-xs text-foreground font-semibold'>
                              {t.totalPretty}
                            </td>
                            <td className='px-4 py-2 text-right font-mono text-xs text-muted-foreground'>
                              {t.tablePretty}
                            </td>
                            <td className='px-4 py-2 text-right font-mono text-xs text-muted-foreground'>
                              {t.indexPretty}
                            </td>
                            <td className='px-4 py-2 text-right font-mono text-xs text-muted-foreground'>
                              {t.toastBytes > 0 ? formatSizeBytes(t.toastBytes) : '-'}
                            </td>
                            <td className='px-4 py-2 text-right font-mono text-xs text-muted-foreground'>
                              {t.rowCount.toLocaleString()}
                            </td>
                            <td className='px-4 py-2'>
                              <div className='flex items-center gap-2'>
                                <div className='flex-1 h-2 rounded-full bg-muted overflow-hidden'>
                                  <div
                                    className='h-full rounded-full bg-primary transition-all'
                                    style={{ width: `${Math.max(pct, 1)}%` }}
                                  />
                                </div>
                                <span className='text-[10px] text-muted-foreground tabular-nums w-10 text-right'>
                                  {pct >= 1 ? `${pct.toFixed(0)}%` : '<1%'}
                                </span>
                              </div>
                            </td>
                            <td className='px-4 py-2 text-center'>
                              {isBloated && !isReadOnly ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); vacuumFullTable(t.name); }}
                                  disabled={vacuumLoading === t.name}
                                  className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-[var(--hn-error-soft)] text-[var(--hn-error)] hover:bg-[var(--hn-error-soft)]/80 transition-colors'
                                >
                                  {vacuumLoading === t.name ? (
                                    <Loader2 className='h-3 w-3 animate-spin' />
                                  ) : (
                                    <RefreshCw className='h-3 w-3' />
                                  )}
                                  {vacuumLoading === t.name ? 'Running' : 'Reclaim'}
                                </button>
                              ) : (
                                <span className='text-[10px] text-[var(--hn-good)]'>OK</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Per-column detail */}
              {sizeSelectedTable && (
                <div className='bg-card rounded-lg border border-primary/40 overflow-hidden'>
                  <div className='px-4 py-3 border-b border-primary/40 bg-primary/10'>
                    <h3 className='text-sm font-semibold text-primary flex items-center gap-2'>
                      <Hash className='h-3.5 w-3.5' />
                      {sizeSelectedTable} — Column Size Analysis
                    </h3>
                  </div>
                  {sizeColumnLoading ? (
                    <div className='flex items-center justify-center py-12'>
                      <Loader2 className='h-6 w-6 text-primary animate-spin' />
                    </div>
                  ) : sizeColumnData ? (
                    <div>
                      <div className='px-4 py-3 flex flex-wrap gap-4 text-xs border-b border-border'>
                        <span className='text-muted-foreground'>
                          Rows: <strong className='text-foreground'>{sizeColumnData.rowCount.toLocaleString()}</strong>
                        </span>
                        <span className='text-muted-foreground'>
                          Avg row size: <strong className='text-foreground'>{sizeColumnData.avgRowSize} bytes</strong>
                        </span>
                        <span className='text-muted-foreground'>
                          Columns: <strong className='text-foreground'>{sizeColumnData.items.length}</strong>
                        </span>
                      </div>
                      <div className='overflow-x-auto'>
                        <table className='w-full text-sm'>
                          <thead>
                            <tr className='bg-muted/50'>
                              <th className='text-left px-4 py-2 font-medium text-muted-foreground'>Column</th>
                              <th className='text-left px-4 py-2 font-medium text-muted-foreground'>Type</th>
                              <th className='text-right px-4 py-2 font-medium text-muted-foreground'>Avg Size</th>
                              <th className='text-right px-4 py-2 font-medium text-muted-foreground'>NULL Ratio</th>
                              <th className='text-left px-4 py-2 font-medium text-muted-foreground w-[200px]'>Size Ratio</th>
                            </tr>
                          </thead>
                          <tbody className='divide-y divide-border'>
                            {sizeColumnData.items
                              .slice()
                              .sort((a, b) => b.avgBytes - a.avgBytes)
                              .map((col) => {
                                const maxColBytes = Math.max(...sizeColumnData.items.map(c => c.avgBytes)) || 1;
                                const pct = (col.avgBytes / maxColBytes) * 100;
                                return (
                                  <tr key={col.name} className='hover:bg-muted/50'>
                                    <td className='px-4 py-2'>
                                      <Tooltip text={getColumnDescription(sizeSelectedTable, col.name) || col.type}>
                                        <span className='font-mono text-xs text-foreground'>
                                          {col.name}
                                        </span>
                                      </Tooltip>
                                    </td>
                                    <td className='px-4 py-2 font-mono text-xs text-muted-foreground'>
                                      {col.type}
                                    </td>
                                    <td className='px-4 py-2 text-right font-mono text-xs text-foreground font-semibold'>
                                      {col.avgBytes > 0 ? `${col.avgBytes} B` : '-'}
                                    </td>
                                    <td className='px-4 py-2 text-right'>
                                      <span className={`text-xs font-mono ${
                                        col.nullRatio > 50
                                          ? 'text-[var(--hn-warn)]'
                                          : col.nullRatio > 0
                                            ? 'text-muted-foreground'
                                            : 'text-[var(--hn-good)]'
                                      }`}>
                                        {col.nullRatio > 0 ? `${col.nullRatio}%` : '0%'}
                                      </span>
                                    </td>
                                    <td className='px-4 py-2'>
                                      <div className='flex items-center gap-2'>
                                        <div className='flex-1 h-2 rounded-full bg-muted overflow-hidden'>
                                          <div
                                            className='h-full rounded-full bg-primary transition-all'
                                            style={{ width: `${Math.max(pct, col.avgBytes > 0 ? 2 : 0)}%` }}
                                          />
                                        </div>
                                        <span className='text-[10px] text-muted-foreground tabular-nums w-10 text-right'>
                                          {pct >= 1 ? `${pct.toFixed(0)}%` : col.avgBytes > 0 ? '<1%' : '-'}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
