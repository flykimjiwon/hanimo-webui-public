'use client';

import { useState } from 'react';
import { Play, Loader2, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

// Dynamic input form based on input schema
function DynamicInputForm({ inputSchema, values, onChange }) {
  const { t } = useTranslation();
  if (!inputSchema || inputSchema.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        {t('workflow.test_no_input_nodes')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {inputSchema.map((field) => (
        <div key={field.variableName || field.label}>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            {field.label || field.variableName}
            {field.required && <span className="text-[var(--hn-error)] ml-1">*</span>}
          </label>
          {field.inputType === 'number' ? (
            <input
              type="number"
              value={values[field.variableName] ?? field.defaultValue ?? ''}
              onChange={(e) => onChange(field.variableName, e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : field.inputType === 'select' && field.options ? (
            <select
              value={values[field.variableName] ?? field.defaultValue ?? ''}
              onChange={(e) => onChange(field.variableName, e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <textarea
              rows={2}
              value={values[field.variableName] ?? field.defaultValue ?? ''}
              onChange={(e) => onChange(field.variableName, e.target.value)}
              placeholder={field.placeholder || `${field.label || field.variableName} 입력`}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Result display component
function ResultDisplay({ result }) {
  const { t } = useTranslation();
  if (!result) return null;

  const isError = result.error;
  const isJson = typeof result.output === 'object';

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        {isError ? (
          <AlertCircle className="w-4 h-4 text-[var(--hn-error)]" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-[var(--hn-good)]" />
        )}
        <span
          className={`text-sm font-semibold ${isError ? 'text-[var(--hn-error)]' : 'text-[var(--hn-good)]'}`}
        >
          {isError ? t('workflow.test_failed') : t('workflow.test_completed')}
        </span>
        {/* Execution stats */}
        {!isError && (
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {result.durationMs != null && <span>{result.durationMs}ms</span>}
            {result.tokenUsage != null && <span>{result.tokenUsage} {t('workflow.tokens')}</span>}
          </div>
        )}
      </div>

      {/* Error message */}
      {isError && (
        <div className="p-3 rounded-lg bg-[var(--hn-error-soft)] border border-[color-mix(in_oklch,var(--hn-error)_28%,transparent)]">
          <p className="text-sm text-[var(--hn-error)]">{result.error}</p>
        </div>
      )}

      {/* Success result */}
      {!isError && result.output != null && (
        <div className="p-3 rounded-lg bg-muted border border-border">
          {isJson ? (
            <pre className="text-xs text-foreground overflow-auto max-h-48 whitespace-pre-wrap">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {String(result.output)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Test panel main
export default function TestPanel({ workflowId, inputSchema = [] }) {
  const { t } = useTranslation();
  const [inputValues, setInputValues] = useState({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(true);

  const handleInputChange = (key, value) => {
    setInputValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleRun = async () => {
    if (!workflowId) return;
    setRunning(true);
    setResult(null);

    try {
      const startTime = Date.now();
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/workflows/${workflowId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ inputs: inputValues }),
      });
      const durationMs = Date.now() - startTime;
      const data = await res.json();

      if (!res.ok) {
        setResult({ error: data.error || t('workflow.test_error') });
      } else {
        setResult({ ...data, durationMs });
      }
    } catch (err) {
      setResult({ error: err.message || t('workflow.test_network_error') });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border-t border-border bg-background">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted transition-colors"
      >
        <span className="text-sm font-bold text-foreground">{t('workflow.test_title')}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Panel content */}
      {expanded && (
        <div className="px-4 pb-4">
          <DynamicInputForm
            inputSchema={inputSchema}
            values={inputValues}
            onChange={handleInputChange}
          />

          {/* Run button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={running || !workflowId}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('workflow.test_running')}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {t('workflow.test_run')}
              </>
            )}
          </button>

          <ResultDisplay result={result} />
        </div>
      )}
    </div>
  );
}
