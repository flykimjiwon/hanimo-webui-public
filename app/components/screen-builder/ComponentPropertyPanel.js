'use client';

import { Plus, Trash2 } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

// 공통 입력 래퍼
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || ''}
      className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function NumberField({ value, onChange, min, max }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border text-primary focus:ring-ring"
      />
      <span className="text-xs text-foreground">{label}</span>
    </label>
  );
}

// Select 옵션 편집기
function OptionsEditor({ options, onChange }) {
  const { t } = useTranslation();
  const opts = options || [];

  const handleAdd = () => {
    onChange([...opts, { label: t('screen_builder.option'), value: `option${opts.length + 1}` }]);
  };

  const handleRemove = (i) => {
    onChange(opts.filter((_, idx) => idx !== i));
  };

  const handleChange = (i, field, val) => {
    const next = opts.map((opt, idx) => (idx === i ? { ...opt, [field]: val } : opt));
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {opts.map((opt, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            value={opt.label}
            onChange={(e) => handleChange(i, 'label', e.target.value)}
            placeholder={t('screen_builder.option_label')}
            className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="text"
            value={opt.value}
            onChange={(e) => handleChange(i, 'value', e.target.value)}
            placeholder={t('screen_builder.option_value')}
            className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button type="button" onClick={() => handleRemove(i)} className="p-1 text-[var(--hn-error)] hover:opacity-80">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
      >
        <Plus className="w-3 h-3" />{t('screen_builder.add_option')}
      </button>
    </div>
  );
}

// 컴포넌트 속성 패널
export default function ComponentPropertyPanel({ component, onUpdate, endpoints }) {
  const { t } = useTranslation();

  if (!component) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground italic">
        {t('screen_builder.select_component')}
      </div>
    );
  }

  const set = (field, value) => onUpdate({ ...component, [field]: value });

  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t('screen_builder.edit_properties')}</p>

      {/* 공통: colSpan */}
      <Field label={`${t('screen_builder.width')} (${t('screen_builder.current')}: ${component.colSpan || 12}/12)`}>
        <input
          type="range"
          min={1}
          max={12}
          value={component.colSpan || 12}
          onChange={(e) => set('colSpan', Number(e.target.value))}
          className="w-full"
        />
      </Field>

      {/* 공통: variableName (입력/출력 컴포넌트) */}
      {['TextInput','TextArea','Select','NumberInput','FileUpload','Toggle','TextDisplay','JsonDisplay','ChartDisplay','ImageDisplay','TableDisplay'].includes(component.type) && (
        <Field label={t('screen_builder.variable_name')}>
          <TextInput value={component.variableName} onChange={(v) => set('variableName', v)} placeholder="예: userInput" />
        </Field>
      )}

      {/* 입력 컴포넌트 공통: label, placeholder */}
      {['TextInput','TextArea','Select','NumberInput'].includes(component.type) && (
        <>
          <Field label={t('screen_builder.label')}>
            <TextInput value={component.label} onChange={(v) => set('label', v)} placeholder={t('screen_builder.label')} />
          </Field>
          {component.type !== 'Select' && (
            <Field label={t('screen_builder.placeholder')}>
              <TextInput value={component.placeholder} onChange={(v) => set('placeholder', v)} placeholder={t('screen_builder.hint_text')} />
            </Field>
          )}
        </>
      )}

      {/* TextInput / TextArea: required */}
      {['TextInput','TextArea'].includes(component.type) && (
        <Checkbox label={t('screen_builder.required')} checked={component.required} onChange={(v) => set('required', v)} />
      )}

      {/* Select: options */}
      {component.type === 'Select' && (
        <Field label={t('screen_builder.options_list')}>
          <OptionsEditor options={component.options} onChange={(v) => set('options', v)} />
        </Field>
      )}

      {/* NumberInput: min, max, step */}
      {component.type === 'NumberInput' && (
        <>
          <Field label={t('screen_builder.min_value')}><NumberField value={component.min} onChange={(v) => set('min', v)} /></Field>
          <Field label={t('screen_builder.max_value')}><NumberField value={component.max} onChange={(v) => set('max', v)} /></Field>
          <Field label={t('screen_builder.step')}><NumberField value={component.step || 1} onChange={(v) => set('step', v)} min={0.001} /></Field>
        </>
      )}

      {/* Toggle: label */}
      {component.type === 'Toggle' && (
        <Field label={t('screen_builder.label')}>
          <TextInput value={component.label} onChange={(v) => set('label', v)} placeholder={t('screen_builder.toggle_label')} />
        </Field>
      )}

      {/* TextDisplay: bindVariable, useMarkdown */}
      {component.type === 'TextDisplay' && (
        <>
          <Field label={t('screen_builder.bind_variable')}>
            <TextInput value={component.bindVariable} onChange={(v) => set('bindVariable', v)} placeholder={t('screen_builder.output_variable_name')} />
          </Field>
          <Checkbox label={t('screen_builder.markdown_rendering')} checked={component.useMarkdown} onChange={(v) => set('useMarkdown', v)} />
        </>
      )}

      {/* JsonDisplay / ImageDisplay: bindVariable */}
      {['JsonDisplay','ImageDisplay'].includes(component.type) && (
        <Field label={t('screen_builder.bind_variable')}>
          <TextInput value={component.bindVariable} onChange={(v) => set('bindVariable', v)} placeholder={t('screen_builder.output_variable_name')} />
        </Field>
      )}

      {/* ChartDisplay: bindVariable, chartType */}
      {component.type === 'ChartDisplay' && (
        <>
          <Field label={t('screen_builder.bind_variable')}>
            <TextInput value={component.bindVariable} onChange={(v) => set('bindVariable', v)} placeholder={t('screen_builder.output_variable_name')} />
          </Field>
          <Field label={t('screen_builder.chart_type')}>
            <select
              value={component.chartType || 'bar'}
              onChange={(e) => set('chartType', e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="bar">{t('screen_builder.chart_bar')}</option>
              <option value="line">{t('screen_builder.chart_line')}</option>
              <option value="pie">{t('screen_builder.chart_pie')}</option>
            </select>
          </Field>
        </>
      )}

      {/* TableDisplay: bindVariable */}
      {component.type === 'TableDisplay' && (
        <Field label={t('screen_builder.bind_variable')}>
          <TextInput value={component.bindVariable} onChange={(v) => set('bindVariable', v)} placeholder={t('screen_builder.output_variable_array')} />
        </Field>
      )}

      {/* Heading: text, size */}
      {component.type === 'Heading' && (
        <>
          <Field label={t('screen_builder.heading_text')}>
            <TextInput value={component.text} onChange={(v) => set('text', v)} placeholder={t('screen_builder.heading')} />
          </Field>
          <Field label={t('screen_builder.size')}>
            <select
              value={component.size || 'h2'}
              onChange={(e) => set('size', e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="h1">H1 ({t('screen_builder.size_xl')})</option>
              <option value="h2">H2 ({t('screen_builder.size_lg')})</option>
              <option value="h3">H3 ({t('screen_builder.size_md')})</option>
              <option value="h4">H4 ({t('screen_builder.size_sm')})</option>
            </select>
          </Field>
        </>
      )}

      {/* Paragraph: text */}
      {component.type === 'Paragraph' && (
        <Field label={t('screen_builder.content')}>
          <textarea
            rows={3}
            value={component.text || ''}
            onChange={(e) => set('text', e.target.value)}
            placeholder={t('screen_builder.paragraph_content')}
            className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </Field>
      )}

      {/* Button: label, style, endpointId */}
      {component.type === 'Button' && (
        <>
          <Field label={t('screen_builder.button_text')}>
            <TextInput value={component.label} onChange={(v) => set('label', v)} placeholder={t('screen_builder.button')} />
          </Field>
          <Field label={t('screen_builder.style')}>
            <select
              value={component.style || 'primary'}
              onChange={(e) => set('style', e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="primary">{t('screen_builder.style_primary')}</option>
              <option value="secondary">{t('screen_builder.style_secondary')}</option>
            </select>
          </Field>
          <Field label={t('screen_builder.connected_endpoint')}>
            <select
              value={component.endpointId || ''}
              onChange={(e) => set('endpointId', e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t('screen_builder.no_endpoint')}</option>
              {(endpoints || []).map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.name || ep.id}</option>
              ))}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}
