'use client';

import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Play,
  Trash2,
  Edit3,
  Loader2,
  AlertCircle,
  Clock,
  FileText,
} from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';
import dynamic from 'next/dynamic';
const SiteMenuSelector = dynamic(() => import('@/components/SiteMenuSelector'), { ssr: false });

// Status badge component
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const cfg = {
    published: 'bg-[var(--hn-good-soft)] text-[var(--hn-good)]',
    draft: 'bg-muted text-muted-foreground',
  };
  const label = status === 'published' ? t('workflow.status_published') : t('workflow.status_draft');
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg[status] || cfg.draft}`}
    >
      {label}
    </span>
  );
}

// Workflow card
function WorkflowCard({ workflow, onEdit, onDelete, onRun }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`"${workflow.name}" ${t('workflow.confirm_delete')}`)) return;
    setDeleting(true);
    await onDelete(workflow.id);
    setDeleting(false);
  };

  const updatedAt = workflow.updated_at
    ? new Date(workflow.updated_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '-';

  return (
    <div
      className="group relative bg-background rounded-xl border border-border hover:border-primary hover:shadow-md transition-all cursor-pointer p-5"
      onClick={() => onEdit(workflow.id)}
    >
      {/* Top: icon + name + status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--hn-primary-soft)]">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground line-clamp-1">
              {workflow.name || t('workflow.unnamed')}
            </h3>
            <div className="mt-1">
              <StatusBadge status={workflow.status} />
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-4 min-h-[2rem]">
        {workflow.description || t('workflow.no_description')}
      </p>

      {/* Bottom: updated date + buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{updatedAt}</span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Test run button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRun(workflow.id);
            }}
            className="p-1.5 rounded-md hover:bg-[var(--hn-good-soft)] text-[var(--hn-good)] transition-colors"
            title={t('workflow.run_test')}
            aria-label={t('workflow.run_test')}
          >
            <Play className="w-4 h-4" />
          </button>

          {/* Edit button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(workflow.id);
            }}
            className="p-1.5 rounded-md hover:bg-[var(--hn-primary-soft)] text-primary transition-colors"
            title={t('workflow.edit')}
            aria-label={t('workflow.edit')}
          >
            <Edit3 className="w-4 h-4" />
          </button>

          {/* Delete button */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-md hover:bg-[var(--hn-error-soft)] text-[var(--hn-error)] disabled:opacity-50 transition-colors"
            title={t('workflow.delete')}
            aria-label={t('workflow.delete')}
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Workflow list page
export default function WorkflowListPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workflows', {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(t('workflow.error_load_list'));
      const data = await res.json();
      setWorkflows(data.workflows || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, t]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: t('workflow.new_workflow_name'),
          description: '',
          status: 'draft',
          nodes: [],
          edges: [],
        }),
      });
      if (!res.ok) throw new Error(t('workflow.error_create'));
      const data = await res.json();
      const newId = data.id || data.workflow?.id;
      if (newId) router.push(`/workflow/${newId}`);
      else fetchWorkflows();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(t('workflow.error_delete'));
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = (id) => {
    router.push(`/workflow/${id}`);
  };

  const handleRun = (id) => {
    router.push(`/workflow/${id}?test=1`);
  };

  return (
    <div className="min-h-screen bg-muted">
      <SiteMenuSelector />
      <div className="max-w-6xl mx-auto p-6">
        {/* Dev banner */}
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{t('workflow.dev_banner')}</span>
        </div>
        <PageHead
          eyebrow='워크플로'
          title={t('workflow.title')}
          sub={t('workflow.subtitle')}
          actions={
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold text-sm rounded-lg shadow-sm transition-colors"
            >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {t('workflow.new_workflow')}
            </button>
          }
        />

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-[var(--hn-error-soft)] border border-[var(--hn-error)]/30 rounded-lg mb-6">
            <AlertCircle className="w-5 h-5 text-[var(--hn-error)] flex-shrink-0" />
            <p className="text-sm text-[var(--hn-error)]">{error}</p>
            <button
              type="button"
              onClick={fetchWorkflows}
              className="ml-auto text-sm text-[var(--hn-error)] underline hover:no-underline"
            >
              {t('workflow.retry')}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && workflows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 rounded-2xl bg-muted mb-4">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">
              {t('workflow.empty_title')}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {t('workflow.empty_description')}
            </p>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />{t('workflow.create_first')}
            </button>
          </div>
        )}

        {/* Workflow grid */}
        {!loading && workflows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRun={handleRun}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
