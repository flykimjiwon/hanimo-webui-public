'use client';

import { useState, useCallback } from 'react';
import { Loader2, AlertCircle } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ── 차트 색상 팔레트
const CHART_COLORS = ['var(--hn-primary)', 'var(--hn-info)', 'var(--hn-good)', 'var(--hn-warn)', 'var(--hn-error)', 'var(--hn-fg-muted)'];

// ── 개별 컴포넌트 렌더러 ──────────────────────────────

function RenderTextInput({ comp, value, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      {comp.label && <label className="text-sm font-medium text-foreground">{comp.label}{comp.required && <span className="text-[var(--hn-error)] ml-0.5">*</span>}</label>}
      <input
        type="text"
        placeholder={comp.placeholder || ''}
        value={value || ''}
        onChange={(e) => onChange(comp.variableName, e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
    </div>
  );
}

function RenderTextArea({ comp, value, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      {comp.label && <label className="text-sm font-medium text-foreground">{comp.label}{comp.required && <span className="text-[var(--hn-error)] ml-0.5">*</span>}</label>}
      <textarea
        rows={comp.rows || 4}
        placeholder={comp.placeholder || ''}
        value={value || ''}
        onChange={(e) => onChange(comp.variableName, e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-y"
      />
    </div>
  );
}

function RenderSelect({ comp, value, onChange, disabled, t }) {
  return (
    <div className="flex flex-col gap-1">
      {comp.label && <label className="text-sm font-medium text-foreground">{comp.label}</label>}
      <select
        value={value || ''}
        onChange={(e) => onChange(comp.variableName, e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="">{t('screen_builder.select_placeholder')}</option>
        {(comp.options || []).map((opt, i) => (
          <option key={i} value={opt.value || opt}>{opt.label || opt}</option>
        ))}
      </select>
    </div>
  );
}

function RenderNumberInput({ comp, value, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      {comp.label && <label className="text-sm font-medium text-foreground">{comp.label}</label>}
      <input
        type="number"
        placeholder={comp.placeholder || ''}
        value={value ?? ''}
        min={comp.min}
        max={comp.max}
        step={comp.step || 1}
        onChange={(e) => onChange(comp.variableName, e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
    </div>
  );
}

function RenderFileUpload({ comp, onChange, disabled, t }) {
  const [fileName, setFileName] = useState('');
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => onChange(comp.variableName, { name: file.name, data: reader.result, type: file.type });
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex flex-col gap-1">
      {comp.label && <label className="text-sm font-medium text-foreground">{comp.label}</label>}
      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors">
        <input type="file" className="hidden" onChange={handleChange} disabled={disabled} accept={comp.accept || '*'} />
        <span className="text-sm text-muted-foreground">{fileName || t('screen_builder.select_file')}</span>
      </label>
    </div>
  );
}

function RenderToggle({ comp, value, onChange, disabled }) {
  const checked = Boolean(value);
  return (
    <div className="flex items-center gap-3">
      {comp.label && <span className="text-sm font-medium text-foreground">{comp.label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(comp.variableName, !checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function RenderTextDisplay({ comp, outputValues }) {
  const text = comp.bindVariable ? (outputValues[comp.bindVariable] ?? '') : (comp.text || '');
  return (
    <div className="text-sm text-foreground whitespace-pre-wrap">
      {String(text)}
    </div>
  );
}

function RenderJsonDisplay({ comp, outputValues, t }) {
  const data = comp.bindVariable ? outputValues[comp.bindVariable] : null;
  const text = data !== null && data !== undefined
    ? (typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    : `(${t('screen_builder.no_output')})`;
  return (
    <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-lg p-3 overflow-auto max-h-64">
      <code>{text}</code>
    </pre>
  );
}

function RenderChartDisplay({ comp, outputValues, t }) {
  const rawData = comp.bindVariable ? outputValues[comp.bindVariable] : null;
  const data = Array.isArray(rawData) ? rawData : [];
  const chartType = comp.chartType || 'bar';

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 bg-muted rounded-lg text-sm text-muted-foreground">
        {t('screen_builder.no_data')}
      </div>
    );
  }

  const dataKeys = Object.keys(data[0] || {}).filter((k) => k !== 'name' && typeof data[0][k] === 'number');

  return (
    <ResponsiveContainer width="100%" height={240}>
      {chartType === 'pie' ? (
        <PieChart>
          <Pie data={data} dataKey={dataKeys[0] || 'value'} nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      ) : chartType === 'line' ? (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {dataKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </LineChart>
      ) : (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {dataKeys.map((k, i) => <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function RenderImageDisplay({ comp, outputValues, t }) {
  const src = comp.bindVariable ? (outputValues[comp.bindVariable] || '') : (comp.src || '');
  if (!src) return <div className="h-32 bg-muted rounded-lg flex items-center justify-center text-sm text-muted-foreground">{t('screen_builder.no_image')}</div>;
  return <img src={src} alt={comp.alt || ''} className="w-full rounded-lg object-cover" />;
}

function RenderTableDisplay({ comp, outputValues, t }) {
  const rawData = comp.bindVariable ? outputValues[comp.bindVariable] : null;
  const rows = Array.isArray(rawData) ? rawData : [];
  const columns = comp.columns?.length ? comp.columns : (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : []);

  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">{t('screen_builder.no_data')}</div>;
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="bg-background hover:bg-muted">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-foreground">
                  {String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RenderHeading({ comp }) {
  const size = comp.size || 'h2';
  const cls = {
    h1: 'text-3xl font-bold text-foreground',
    h2: 'text-2xl font-bold text-foreground',
    h3: 'text-xl font-semibold text-foreground',
    h4: 'text-lg font-semibold text-foreground',
  };
  const Tag = size;
  return <Tag className={cls[size]}>{comp.text || ''}</Tag>;
}

function RenderParagraph({ comp }) {
  return <p className="text-sm text-foreground leading-relaxed">{comp.text || ''}</p>;
}

function RenderDivider() {
  return <hr className="border-border" />;
}

function RenderContainer({ comp, inputValues, outputValues, onChange, disabled, onButtonClick, loading, t }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: comp.backgroundColor || undefined,
        padding: comp.padding || undefined,
      }}
    >
      {(comp.children || []).map((child) => (
        <ComponentRenderer
          key={child.id}
          comp={child}
          inputValues={inputValues}
          outputValues={outputValues}
          onChange={onChange}
          disabled={disabled}
          onButtonClick={onButtonClick}
          loading={loading}
          t={t}
        />
      ))}
    </div>
  );
}

function RenderButton({ comp, onButtonClick, loading, disabled, t }) {
  const isPrimary = comp.style !== 'secondary';
  return (
    <button
      type="button"
      onClick={() => onButtonClick(comp)}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isPrimary
          ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
          : 'bg-muted hover:bg-muted/80 text-foreground border border-border'
      }`}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {comp.label || t('screen_builder.type_button')}
    </button>
  );
}

// ── 컴포넌트 디스패처
function ComponentRenderer({ comp, inputValues, outputValues, onChange, disabled, onButtonClick, loading, t }) {
  switch (comp.type) {
    case 'TextInput':   return <RenderTextInput comp={comp} value={inputValues[comp.variableName]} onChange={onChange} disabled={disabled} />;
    case 'TextArea':    return <RenderTextArea comp={comp} value={inputValues[comp.variableName]} onChange={onChange} disabled={disabled} />;
    case 'Select':      return <RenderSelect comp={comp} value={inputValues[comp.variableName]} onChange={onChange} disabled={disabled} t={t} />;
    case 'NumberInput': return <RenderNumberInput comp={comp} value={inputValues[comp.variableName]} onChange={onChange} disabled={disabled} />;
    case 'FileUpload':  return <RenderFileUpload comp={comp} onChange={onChange} disabled={disabled} t={t} />;
    case 'Toggle':      return <RenderToggle comp={comp} value={inputValues[comp.variableName]} onChange={onChange} disabled={disabled} />;
    case 'TextDisplay': return <RenderTextDisplay comp={comp} outputValues={outputValues} />;
    case 'JsonDisplay': return <RenderJsonDisplay comp={comp} outputValues={outputValues} t={t} />;
    case 'ChartDisplay': return <RenderChartDisplay comp={comp} outputValues={outputValues} t={t} />;
    case 'ImageDisplay': return <RenderImageDisplay comp={comp} outputValues={outputValues} t={t} />;
    case 'TableDisplay': return <RenderTableDisplay comp={comp} outputValues={outputValues} t={t} />;
    case 'Heading':     return <RenderHeading comp={comp} />;
    case 'Paragraph':   return <RenderParagraph comp={comp} />;
    case 'Divider':     return <RenderDivider />;
    case 'Container':   return <RenderContainer comp={comp} inputValues={inputValues} outputValues={outputValues} onChange={onChange} disabled={disabled} onButtonClick={onButtonClick} loading={loading} t={t} />;
    case 'Button':      return <RenderButton comp={comp} onButtonClick={onButtonClick} loading={loading} disabled={disabled} t={t} />;
    default:            return <div className="text-xs text-muted-foreground italic">{t('screen_builder.unknown_component')}: {comp.type}</div>;
  }
}

// ── 메인 ScreenRenderer ────────────────────────────────────────────────────────

export default function ScreenRenderer({ definition, screenId, isPreview }) {
  const { t } = useTranslation();
  const [inputValues, setInputValues] = useState({});
  const [outputValues, setOutputValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = useCallback((varName, value) => {
    setInputValues((prev) => ({ ...prev, [varName]: value }));
  }, []);

  const handleButtonClick = useCallback(async (comp) => {
    if (isPreview) return; // 미리보기 모드에서는 실행 안 함
    if (!comp.endpointId) return;

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/screens/${screenId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ endpointId: comp.endpointId, inputValues }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || t('screen_builder.execution_failed'));
      }

      const data = await res.json();
      setOutputValues((prev) => ({ ...prev, ...(data.outputs || {}) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [screenId, inputValues, isPreview, t]);

  const components = definition?.components || [];

  if (components.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">{t('screen_builder.no_components')}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--hn-error-soft)] border border-[color-mix(in_oklch,var(--hn-error)_28%,transparent)] rounded-lg mb-4">
          <AlertCircle className="w-4 h-4 text-[var(--hn-error)] flex-shrink-0" />
          <p className="text-sm text-[var(--hn-error)]">{error}</p>
          <button type="button" onClick={() => setError('')} className="ml-auto text-[var(--hn-error)] hover:opacity-80 text-xs underline">{t('screen_builder.close')}</button>
        </div>
      )}

      {/* 12컬럼 그리드 */}
      <div className="grid grid-cols-12 gap-4">
        {components.map((comp) => (
          <div
            key={comp.id}
            className={`col-span-${comp.colSpan || 12}`}
            style={{ gridColumn: `span ${comp.colSpan || 12}` }}
          >
            <ComponentRenderer
              comp={comp}
              inputValues={inputValues}
              outputValues={outputValues}
              onChange={handleChange}
              disabled={loading}
              onButtonClick={handleButtonClick}
              loading={loading}
              t={t}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
